@id:mealie-recipes
Feature: Mealie recipes, single deletes and new tokens
  An agent finds and reads recipes at level read, and imports a recipe when a human approves it.
  A delete of one item needs an approval but no typed literal.
  A new token goes to Mealie, but the agent gets it masked.

  Rule: The agent finds a recipe and reads it by its slug

    Scenario: A search for pasta finds the pasta recipe
      Given the group of "find pasta recipes" is at level read
      When the agent runs "find pasta recipes"
      Then the agent gets a result that contains "\"slug\":\"pasta\""

    Scenario: The pasta recipe has its name
      Given the group of "read the pasta recipe" is at level read
      When the agent runs "read the pasta recipe"
      Then the agent gets a result that contains "Pasta Fagioli"

  Rule: A human approves each import from a web address

    Scenario: The approval shows the web address of the import
      Given the group of "import the ramen recipe" is at level ask
      When the agent runs "import the ramen recipe", and the human approves it
      Then the approval shows '/recipes/create/url {"url":"https://x.example/ramen"}'

    Scenario: The approved import gives the slug of the new recipe
      Given the group of "import the ramen recipe" is at level ask
      When the agent runs "import the ramen recipe", and the human approves it
      Then the agent gets a result that contains "ramen"

  Rule: A delete of one item runs after an approval with no typed literal

    Scenario: A human approves the delete of a comment
      Given the operation of "delete the comment c-1" is at level ask
      When the agent runs "delete the comment c-1", and the human approves it
      Then the agent gets a result that contains "Too salty"

    Scenario: A human approves the delete of a food
      Given the operation of "delete the food f-1" is at level ask
      When the agent runs "delete the food f-1", and the human approves it
      Then the agent gets a result that contains "Flour"

  Rule: The agent gets each new token masked

    Scenario: A new API token is masked
      Given the operation of "create an API token" is at level ask
      When the agent runs "create an API token", and the human types "scripts"
      Then the agent gets a result that contains "\"token\":\"[REDACTED]\""

    Scenario: A new password reset token is masked
      Given the operation of "create a password reset token for alex" is at level ask
      When the agent runs "create a password reset token for alex", and the human types "alex@example.com"
      Then the agent gets a result that contains "\"token\":\"[REDACTED]\""
