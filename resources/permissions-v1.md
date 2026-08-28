# AnyDB Permissions

How to answer "who can do what to this?" — and how not to get it wrong.

## Start with `can`

`anydb_get_permissions` returns a `can` block:

```json
"can": {
  "read": true,
  "update": true,
  "delete": false,
  "addChildren": true,
  "share": false
}
```

That is the answer to almost every question. `update` means the record itself
can be changed. `addChildren` means records can be created underneath it.
Those two are independent — see below.

Only read the rest of this if you need the raw matrix.

## The model: two axes

A permission is a **type** crossed with a **level**. Neither alone means
anything.

**Types** name *what part* of a resource is being governed:

| Type | Governs |
| --- | --- |
| `OBJECT_SELF` | the record itself |
| `OBJECT_ATTACHED` | records attached *underneath* it |
| `OBJECT_SHARE` | sharing it |
| `DB_SELF` / `DB_ATTACHED` / `DB_SHARE` / `DB_ADMIN` | the same, for a database |
| `TEAM_SELF` / `TEAM_ATTACHED` / `TEAM_SHARE` / `TEAM_ADMIN` / `TEAM_USERS` | the same, for a team |

**Levels** name *what may be done*: `PERM_READ`, `PERM_CREATE`, `PERM_UPDATE`,
`PERM_DELETE`, and `PERM_ALL` for all of them.

A grant is ALLOW or DENY. The default, with nothing granted, is no access.

## Attaching is a type, not a level

There is no `PERM_ATTACH`. "Can a record be created under this parent?" is:

```
OBJECT_ATTACHED + PERM_CREATE, evaluated on the PARENT
```

Three consequences that are easy to get wrong:

- **It is checked on the parent, not on the record being created.** The new
  record does not exist yet and has no permissions.
- **`PERM_CREATE` is not decorative.** Denying `OBJECT_ATTACHED/PERM_CREATE`
  is exactly what stops a child being created.
- **It is independent of `PERM_UPDATE`.** A user can be allowed to edit a
  record and not allowed to add anything under it. `can.update` and
  `can.addChildren` answer different questions; do not infer one from the
  other.

The equivalent for a database is `DB_ATTACHED/PERM_CREATE`, and for a team,
`TEAM_ATTACHED/PERM_CREATE`.

## One key that does not mean what it looks like

`OBJECT_SELF/PERM_CREATE` does **not** control creating records. Creating a
record that already exists is meaningless, so the key was given a second job:
it is the "may add new records" flag on a shared View, and it is what the UI
reads to decide whether to show the "+ New" button. Outside a shared View it
does not stop anything.

If you want to know whether someone can add records somewhere, read
`can.addChildren`, or check `OBJECT_ATTACHED/PERM_CREATE`. Never
`OBJECT_SELF/PERM_CREATE`.

## Asking about someone else

Both tools default to the authenticated user. Pass `userid` to ask about
another person.

The call is refused unless *you* can already read the resource — a credential
cannot enumerate permissions on records it has no access to. A refusal means
the resource is invisible to you, not that the other user lacks access.

## Choosing a tool

- **`anydb_get_permissions`** — one resource, one user, everything. Use it
  when you want to describe or explain access.
- **`anydb_check_permissions`** — specific type/level pairs, up to 50 at a
  time. Use it when you already know what you need to know.

Both are read-only and change nothing.

## Worked questions

| Question | What to read |
| --- | --- |
| Can Sam edit this record? | `can.update` |
| Can Sam add a row under this record? | `can.addChildren` |
| Can Sam delete it? | `can.delete` |
| Why can Sam see it? | `roleIds`, plus `permissions.OBJECT_SELF.PERM_READ.reason` |
| Can I add records to this database? | `can.addChildren` on the database |
