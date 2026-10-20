Feature: Lidarr calls
  An agent uses Lidarr to find artists, to start searches and to change single items.
  A single-item write needs the approval of a human. The human does not type a literal for it.

  Rule: The agent reads Lidarr at level read

    Scenario: The agent looks up an artist
      Given the group of "look up portishead" is at level read
      When the agent runs "look up portishead"
      Then the agent gets a result that contains "8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11"

  Rule: A single-item write runs when a human approves it, with no literal

    Scenario: The human approves an album search
      Given the operation of "search for ok computer" is at level ask
      When the agent runs "search for ok computer", and the human approves it
      Then the agent gets a result that contains "AlbumSearch"

    Scenario: The human approves the delete of one artist and the files
      Given the operation of "delete radiohead with the files" is at level ask
      When the agent runs "delete radiohead with the files", and the human approves it
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
