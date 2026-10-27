# STAR MEDIA CRM — File & Media Management

Production notes for the Files module (Drive-style library with RBAC, project folders, sharing, and in-dashboard preview).

## Architecture

| Layer | Location |
| --- | --- |
| Document / folder model | `server/src/models/Document.ts` |
| Permission service | `server/src/services/filePermissions.ts` |
| Project folder automation | `server/src/services/projectFolders.ts` |
| HTTP API | `server/src/modules/files/routes.ts` |
| Project create/rename hooks | `server/src/modules/projects/routes.ts` |
| UI | `client/src/features/files/FilesPage.tsx` |
| Preview | `client/src/components/files/FilePreviewModal.tsx` |

Binary blobs live in **Cloudinary** (recommended for Render) or **local disk** (`server/uploads`). Metadata and ACL live in MongoDB.

## Permission levels

| Level | View / download | Upload into folder | Rename / move | Share / trash / manage |
| --- | --- | --- | --- | --- |
| viewer | ✓ | | | |
| contributor | ✓ | ✓ | | |
| editor | ✓ | ✓ | ✓ | |
| manager | ✓ | ✓ | ✓ | ✓ |
| owner / CEO admin | full | full | full | full |

Effective access sources (first match wins with highest applicable level):

1. CEO → admin  
2. Owner / uploader → owner  
3. `visibility: company` → viewer (editor for manager/finance/ceo)  
4. Project membership when `visibility` is `project` (or shared + project) → contributor  
5. Direct `shares[]`  
6. Inherited shares / project access from ancestor folders  

Membership is **not** duplicated: removing a user from `Project.members` immediately drops inherited project access. Independent shares and ownership are preserved. Files are never deleted by membership changes.

## Project folders

On project create (and rename), `ensureProjectFolders` creates:

```
Projects / {Project Name}/
  Briefs & Requirements/
  Documents/
  Images & Designs/
  Videos & Media/
  Reports/
  Deliverables/
```

Keys are `projectFolderKey = ${projectId}:root` and `${projectId}:sub:{name}` (unique, idempotent). Renaming the project updates the root folder display name only.

Admin recovery: `POST /api/v1/files/admin/reconcile-project-folders` (CEO only).

## API (authenticated)

- `GET /files/overview` — scoped metrics  
- `GET /files` — list (`view`, `parentId`, `project`, `search`, pagination)  
- `GET /files/item/:id` — metadata + access level  
- `POST /files/folders` — create folder  
- `POST /files/upload` — multipart upload  
- `PATCH /files/item/:id` — rename, move, star, archive, restore  
- `DELETE /files/item/:id` — soft trash (`?permanent=1` CEO)  
- `POST /files/item/:id/share` — grant / revoke (`revoke: true`)  
- `GET /files/:filename` — authorized preview/download  
- `GET /files/chat/:filename` — chat attachment (conversation membership)

Private files are never exposed as permanent public CRM links. Cloudinary redirects inherit Cloudinary URL lifetime; prefer private/signed Cloudinary delivery in production.

## Environment

See root `.env.example`:

- `STORAGE_PROVIDER=local|cloudinary`
- `CLOUDINARY_*`
- `UPLOAD_MAX_MB`

Never put storage secrets in `VITE_*` variables.

## Ops notes

- CEO can run `POST /api/v1/files/admin/reconcile-project-folders` to backfill missing project folders.
- Membership access is live via `Project.members` (no duplicate permission sync table).
