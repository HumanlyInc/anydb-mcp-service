import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ExtApiClient } from "./ext-api-client.js";
import { toolJson } from "./result-format.js";

/**
 * ISSUE - 673: building a permission structure. Each tool wraps one
 * /integrations/ext route; every rule is the server's: the caller must be
 * allowed to change the resource's access, a team or workspace role is only
 * for someone in the team, and app tokens are refused. How roles, inheritance
 * and groups fit together is in anydb://guides/permissions/v1.
 */

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "must be a 24-character id");
const resource = { teamid: objectId, adbid: objectId.optional(), adoid: objectId.optional() };
const who = { userid: objectId.optional(), groupid: objectId.optional() };
const oneTarget = (v: { userid?: string; groupid?: string }) => !!v.userid !== !!v.groupid;
const PERMISSION_TYPES = [
  "TEAM_SELF", "TEAM_ADMIN", "TEAM_ATTACHED", "TEAM_USERS", "TEAM_SHARE",
  "DB_SELF", "DB_ADMIN", "DB_ATTACHED", "DB_SHARE",
  "OBJECT_SELF", "OBJECT_ATTACHED", "OBJECT_SHARE",
] as const;
const LEVELS = ["PERM_READ", "PERM_CREATE", "PERM_UPDATE", "PERM_DELETE", "PERM_ALL"] as const;

const schemas = {
  anydb_list_roles: z.object({ teamid: objectId }).strict(),
  anydb_get_access: z.object(resource).strict(),
  anydb_who_can_access: z.object({ ...resource, permission: z.enum(PERMISSION_TYPES), level: z.enum(LEVELS) }).strict(),
  anydb_set_access: z.object({
    ...resource, ...who,
    roleids: z.array(z.string().min(1)).min(1).max(10),
    inherit_down: z.boolean().optional(),
    override: z.boolean().optional(),
  }).strict().refine(oneTarget, "pass exactly one of userid or groupid"),
  anydb_remove_access: z.object({ ...resource, ...who, roleid: z.string().min(1).optional() })
    .strict().refine(oneTarget, "pass exactly one of userid or groupid"),
  anydb_create_group: z.object({ teamid: objectId, name: z.string().trim().min(1).max(200) }).strict(),
  anydb_change_group_members: z.object({
    teamid: objectId, groupid: objectId,
    add: z.array(objectId).max(100).optional(),
    remove: z.array(objectId).max(100).optional(),
  }).strict().refine((v) => (v.add?.length ?? 0) + (v.remove?.length ?? 0) > 0, "send add, remove, or both"),
};

const id = (description: string) => ({ type: "string", pattern: "^[a-fA-F0-9]{24}$", description });
const resourceProps = {
  teamid: id("The team ID."),
  adbid: id("Workspace ID. Omit for the team itself."),
  adoid: id("Record ID. Omit for the workspace or team."),
};
const whoProps = {
  userid: id("The user to grant or remove. Pass this or groupid, not both."),
  groupid: id("The group to grant or remove (from anydb_list_team_groups or anydb_create_group). Pass this or userid."),
};

export const ACCESS_TOOLS: Tool[] = [
  {
    name: "anydb_list_roles",
    description:
      "List the roles that can be granted, each with its roleId and what it allows (perms per team, workspace and record). These are the built-in roles; there are no custom roles yet. Pass a roleId to anydb_set_access.",
    inputSchema: { type: "object", properties: { teamid: id("The team ID.") }, required: ["teamid"], additionalProperties: false },
  },
  {
    name: "anydb_get_access",
    description:
      "Read who holds which roles directly on a team, workspace or record (its ACL), for users and groups. Inherited access from a parent is not listed here; ask anydb_who_can_access or anydb_get_permissions for the effective answer. Refused unless you may read the resource's access.",
    inputSchema: { type: "object", properties: resourceProps, required: ["teamid"], additionalProperties: false },
  },
  {
    name: "anydb_who_can_access",
    description:
      "List the users and groups that can do one thing on a team, workspace or record: a permission type (e.g. DB_SELF for the workspace itself, OBJECT_ATTACHED to add records under a record) at a level (PERM_READ, PERM_CREATE, PERM_UPDATE, PERM_DELETE, PERM_ALL). Includes inherited access.",
    inputSchema: {
      type: "object",
      properties: {
        ...resourceProps,
        permission: { type: "string", enum: [...PERMISSION_TYPES] },
        level: { type: "string", enum: [...LEVELS] },
      },
      required: ["teamid", "permission", "level"],
      additionalProperties: false,
    },
  },
  {
    name: "anydb_set_access",
    description:
      "REPLACE a user's or a group's roles on a team, workspace or record with roleids (from anydb_list_roles): any role they held there before is removed first, as in the Access dialog. inherit_down (default true) also applies the roles to everything underneath; override (default false) replaces inherited access instead of adding to it. The person or group gets this access immediately. A team or workspace role is only for someone in the team (a workspace role also accepts a team guest); a record accepts anyone, as sharing does. Write Only cannot be granted on a team or workspace here (it currently includes admin). Refused unless you may change the resource's access. Check the result with anydb_get_access or anydb_check_permissions.",
    inputSchema: {
      type: "object",
      properties: {
        ...resourceProps,
        ...whoProps,
        roleids: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" }, description: "Role ids from anydb_list_roles." },
        inherit_down: { type: "boolean", description: "Default true: the roles also apply to everything underneath." },
        override: { type: "boolean", description: "Default false: replace inherited access instead of adding to it." },
      },
      required: ["teamid", "roleids"],
      additionalProperties: false,
    },
  },
  {
    name: "anydb_remove_access",
    description:
      "Remove one role (roleid), or every role when roleid is omitted, that a user or group holds directly on a team, workspace or record. Takes effect immediately; access they have through a group or a parent remains. Refused unless you may change the resource's access.",
    inputSchema: {
      type: "object",
      properties: { ...resourceProps, ...whoProps, roleid: { type: "string", description: "The role to remove. Omit to remove all." } },
      required: ["teamid"],
      additionalProperties: false,
    },
  },
  {
    name: "anydb_create_group",
    description:
      "Create a group in the team, to grant access to many people at once with anydb_set_access (groupid). Add people with anydb_change_group_members. Refused unless you may manage the team's groups.",
    inputSchema: {
      type: "object",
      properties: { teamid: id("The team ID."), name: { type: "string", minLength: 1, maxLength: 200 } },
      required: ["teamid", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "anydb_change_group_members",
    description:
      "Add users to, and/or remove them from, a group of the team. Everyone added immediately gets the access the group holds. Refused unless you may manage the group.",
    inputSchema: {
      type: "object",
      properties: {
        teamid: id("The team ID."),
        groupid: id("The group, from anydb_list_team_groups or anydb_create_group."),
        add: { type: "array", maxItems: 100, items: id("A user ID.") },
        remove: { type: "array", maxItems: 100, items: id("A user ID.") },
      },
      required: ["teamid", "groupid"],
      additionalProperties: false,
    },
  },
];

const NAMES = new Set(ACCESS_TOOLS.map((t) => t.name));
export const isAccessTool = (name: string): boolean => NAMES.has(name);

export async function callAccessTool(name: string, args: Record<string, unknown> | undefined, client: ExtApiClient) {
  let result: unknown;
  switch (name) {
    case "anydb_list_roles": result = await client.listRoles(schemas.anydb_list_roles.parse(args ?? {})); break;
    case "anydb_get_access": result = await client.getAccess(schemas.anydb_get_access.parse(args ?? {})); break;
    case "anydb_who_can_access": result = await client.whoCanAccess(schemas.anydb_who_can_access.parse(args ?? {})); break;
    case "anydb_set_access": result = await client.setAccess(schemas.anydb_set_access.parse(args ?? {})); break;
    case "anydb_remove_access": result = await client.removeAccess(schemas.anydb_remove_access.parse(args ?? {})); break;
    case "anydb_create_group": result = await client.createTeamGroup(schemas.anydb_create_group.parse(args ?? {})); break;
    case "anydb_change_group_members": {
      const { groupid, ...body } = schemas.anydb_change_group_members.parse(args ?? {});
      result = await client.changeTeamGroupMembers(groupid, body);
      break;
    }
    default: throw new Error(`Unknown access tool: ${name}`);
  }
  return { content: [{ type: "text" as const, text: toolJson(result, client.getOriginClient()) }] };
}
