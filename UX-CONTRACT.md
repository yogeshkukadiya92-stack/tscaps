# ReelStudio interaction contract

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | controls/fields/Select.tsx | DESIGN.md | Native popup | Keyboard tests |
| Date | AdminPanel datetime-local | UX-CONTRACT.md | Native local time | Admin browser test |
| Form | Feature handlers and shared fields | UX-CONTRACT.md | Review and confirm | Admin browser test |
| Scrollbar | styles/globals.css | DESIGN.md | Editor geometry | Screenshot review |
| Toast | components/Toast | UX-CONTRACT.md | Success and error | Browser tests |
| CRUD | Project hosts and AdminPanel | Server RPC contracts | Existing permission checks | Full flow tests |

## Workflow
Projects use one New project vocabulary. Local search clears immediately and returns input focus. Project queries and admin account searches remain ephemeral to avoid placing private names/emails in browser history; paging/filter state stays in the mounted screen.
Editor task tab labels remain stable for keyboard navigation. Tab descriptions explain scope without changing accessible names. Caption tools use Radix horizontal keyboard semantics. Preview/export and saving keep existing behavior.
Selecting an admin account moves keyboard focus to its detail heading so settings are discoverable below the table. Account section links use native navigation. Money/access changes retain explicit reasons and review/confirm steps. Do not invent new billing states or authorize mutations through styling.

## States and recovery
Retain loading, empty, no-results, error and retry states. Ignore obsolete account fetch responses. Do not remove current project data on failure. Preserve responsive tables with internal horizontal scrolling and natural-height forms. Focus rings, keyboard tabs and reduced-motion preferences remain supported.

## Verification
Run studio typecheck/build, projects-qa, interface-qa and admin-usage browser tests. Inspect desktop, phone and dark-mode screenshots. Static skill audit supplements, never replaces, those checks.
