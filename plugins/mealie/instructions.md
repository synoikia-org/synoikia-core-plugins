# Mealie

Operation keys are `<VERB> <path>` with the full `/api/...` path, as in `GET /api/recipes/{slug}`. Recipes are addressed by slug, most other items by UUID `id`. A user belongs to one group and one household; meal plans, shopping lists and cookbooks belong to the household, recipes and organizers to the group.

List endpoints take `page`, `perPage` (`-1` for all), `orderBy`, `orderDirection` and `queryFilter` (e.g. `name = "Pasta"`) and return `{ items, total, total_pages }`. Recipe search: `search`, `categories`, `tags`, `foods`.

Workflows:

- Find a recipe: `GET /api/recipes` with `search` → `GET /api/recipes/{slug}`.
- Import from a web page: `POST /api/recipes/create/url` with `{ url }` returns the new slug → `GET /api/recipes/{slug}`.
- Plan a meal: `POST /api/households/mealplans` with `{ date, entryType: "dinner", recipeId }`; `GET /api/households/mealplans/today`.
- Shopping: `GET /api/households/shopping/lists` → `POST /api/households/shopping/items` with `{ shoppingListId, note, quantity }`, or `POST /api/households/shopping/lists/{item_id}/recipe/{recipe_id}` to add a recipe's ingredients.
- Organize: `GET /api/organizers/tags` → `POST /api/recipes/bulk-actions/tag`.

Locked (typed confirmation): bulk deletes, admin user, group, household and backup changes, AI providers, webhook create/update, group and household preferences, maintenance cleanup, API tokens, passwords, permissions and invitations. Single deletes are ordinary writes.
