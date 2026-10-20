Feature: Radarr calls
  An agent uses Radarr to find movies, to start searches and to change single items.
  A single-item write needs the approval of a human. The human does not type a literal for it.

  Rule: The agent reads Radarr at level read

    Scenario: The agent looks up a movie
      Given the group of "look up dune" is at level read
      When the agent runs "look up dune"
      Then the agent gets a result that contains "438631"

  Rule: A single-item write runs when a human approves it, with no literal

    Scenario: The human approves a movie search
      Given the operation of "search for arrival" is at level ask
      When the agent runs "search for arrival", and the human approves it
      Then the agent gets a result that contains "MoviesSearch"

    Scenario: The human approves the delete of one movie and its files
      Given the operation of "delete inception with its files" is at level ask
      When the agent runs "delete inception with its files", and the human approves it
      Then the agent gets a result that contains "{}"

    Scenario: The human approves a test of the stored download client
      Given the operation of "test the stored download client" is at level ask
      When the agent runs "test the stored download client", and the human approves it
      Then the agent gets a result that contains "{}"

    Scenario: The human approves a new webhook
      Given the operation of "add a webhook" is at level ask
      When the agent runs "add a webhook", and the human approves it
      Then the agent gets a result that contains "Hook"

  Rule: The approval of a provider write shows where the data goes

    Scenario: The approval of a new webhook shows its host
      Given the operation of "add a webhook" is at level ask
      When the agent runs "add a webhook", and the human approves it
      Then the approval shows "→ https://hooks.example.com"
