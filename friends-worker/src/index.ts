// Stack friends server: a tiny shared space where a group of friends publish
// the parts of their supplement stack they've chosen to share.
//
// KV layout
//   invite:<code>          -> groupId
//   group:<groupId>        -> Group (name, invite code, members with hashed keys)
//   profile:<gid>:<mid>    -> whatever that member last published
//
// Each member authenticates with "Bearer <groupId>.<memberId>.<secret>". Only a
// SHA-256 of the secret is stored. Anyone with the invite link can join.

interface Member {
  name: string;
  keyHash: string;
  joinedAt: string;
}

interface Group {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  members: Record<string, Member>;
}

const MAX_PROFILE_BYTES = 256 * 1024;
const MAX_NAME = 60;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function randomId(bytes = 12) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function cleanName(value: unknown, field: string) {
  const name = String(value ?? '').trim().slice(0, MAX_NAME);
  if (!name) throw new HttpError(400, `${field} is required`);
  return name;
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Expected a JSON body');
  }
}

async function getGroup(env: Env, id: string) {
  return env.STACK.get<Group>(`group:${id}`, 'json');
}

async function addMember(env: Env, group: Group, memberName: string) {
  const memberId = randomId(9);
  const secret = randomId(24);
  group.members[memberId] = { name: memberName, keyHash: await sha256(secret), joinedAt: new Date().toISOString() };
  await env.STACK.put(`group:${group.id}`, JSON.stringify(group));
  return {
    groupId: group.id,
    groupName: group.name,
    inviteCode: group.inviteCode,
    memberId,
    key: `${group.id}.${memberId}.${secret}`,
  };
}

async function authenticate(req: Request, env: Env) {
  const auth = req.headers.get('authorization') ?? '';
  const [groupId, memberId, secret] = auth.replace(/^Bearer\s+/i, '').split('.');
  if (!groupId || !memberId || !secret) throw new HttpError(401, 'Missing or malformed key');
  const group = await getGroup(env, groupId);
  const member = group?.members[memberId];
  if (!group || !member || member.keyHash !== (await sha256(secret))) {
    throw new HttpError(401, 'Not a member of this group');
  }
  return { group, memberId };
}

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;
  const method = req.method;

  if (method === 'GET' && pathname === '/') {
    return new Response('Stack friends server. Paste an invite link into the Stack app to join a group.\n');
  }

  // Invite links are meant to be pasted into the app, but explain that if opened in a browser.
  if (method === 'GET' && pathname.startsWith('/join/')) {
    return new Response(
      'This is a Stack invite link. Open the Stack app, go to Friends, choose "Join a group" and paste this whole link.\n',
    );
  }

  if (method === 'POST' && pathname === '/v1/groups') {
    const b = await body(req);
    const group: Group = {
      id: randomId(9),
      name: cleanName(b.groupName, 'Group name'),
      inviteCode: randomId(9),
      createdAt: new Date().toISOString(),
      members: {},
    };
    await env.STACK.put(`invite:${group.inviteCode}`, group.id);
    return json(await addMember(env, group, cleanName(b.memberName, 'Your name')), 201);
  }

  if (method === 'POST' && pathname === '/v1/join') {
    const b = await body(req);
    const groupId = await env.STACK.get(`invite:${String(b.inviteCode ?? '')}`);
    const group = groupId && (await getGroup(env, groupId));
    if (!group) throw new HttpError(404, 'That invite link is not valid');
    return json(await addMember(env, group, cleanName(b.memberName, 'Your name')), 201);
  }

  if (method === 'GET' && pathname === '/v1/group') {
    const { group, memberId } = await authenticate(req, env);
    const members = await Promise.all(
      Object.entries(group.members).map(async ([id, m]) => ({
        id,
        name: m.name,
        joinedAt: m.joinedAt,
        profile: await env.STACK.get(`profile:${group.id}:${id}`, 'json'),
      })),
    );
    return json({ groupId: group.id, groupName: group.name, inviteCode: group.inviteCode, me: memberId, members });
  }

  if (method === 'PUT' && pathname === '/v1/profile') {
    const { group, memberId } = await authenticate(req, env);
    const text = await req.text();
    if (text.length > MAX_PROFILE_BYTES) throw new HttpError(413, 'Profile is too large');
    let profile: { name?: unknown };
    try {
      profile = JSON.parse(text);
    } catch {
      throw new HttpError(400, 'Expected a JSON body');
    }
    // Keep the member's display name in step with what they publish.
    if (typeof profile.name === 'string' && profile.name.trim()) {
      const name = profile.name.trim().slice(0, MAX_NAME);
      if (group.members[memberId].name !== name) {
        group.members[memberId].name = name;
        await env.STACK.put(`group:${group.id}`, JSON.stringify(group));
      }
    }
    await env.STACK.put(`profile:${group.id}:${memberId}`, text);
    return new Response(null, { status: 204 });
  }

  if (method === 'DELETE' && pathname === '/v1/membership') {
    const { group, memberId } = await authenticate(req, env);
    delete group.members[memberId];
    await env.STACK.delete(`profile:${group.id}:${memberId}`);
    await env.STACK.put(`group:${group.id}`, JSON.stringify(group));
    return new Response(null, { status: 204 });
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(req, env): Promise<Response> {
    try {
      return await route(req, env, new URL(req.url));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
