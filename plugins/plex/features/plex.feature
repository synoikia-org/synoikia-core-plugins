Feature: Plex approvals
  A human approves each Plex write before it runs. A change to one item needs only an approval. A refresh of a library or an item needs the typed name of the item.
  The plugin refuses to write a masked value back to Plex.

  Rule: A human approves a write to one item without a typed literal

    Scenario: The approval of a watched mark names the operation
      Given the operation of "mark Inception watched" is at level ask
      When the agent runs "mark Inception watched", and the human approves it
      Then the approval shows "Plex PUT /:/scrobble"

    Scenario: The delete of one item runs after a plain approval
      Given the operation of "delete Inception" is at level ask
      When the agent runs "delete Inception", and the human approves it
      Then the agent gets a result that contains "{}"

    Scenario: The delete of one playlist runs after a plain approval
      Given the operation of "delete the Road Trip playlist" is at level ask
      When the agent runs "delete the Road Trip playlist", and the human approves it
      Then the agent gets a result that contains "{}"

    Scenario: The cache clean runs after a plain approval
      Given the operation of "clear the library caches" is at level ask
      When the agent runs "clear the library caches", and the human approves it
      Then the agent gets a result that contains "{}"

    Scenario: The end of a session runs after a plain approval
      Given the operation of "stop a session" is at level ask
      When the agent runs "stop a session", and the human approves it
      Then the agent gets a result that contains "{}"

  Rule: Each refresh flag needs the typed name of what it refreshes

    Scenario: A new analysis of an item asks to type the item name
      Given the operation of "analyze Inception again" is at level ask
      When the agent runs "analyze Inception again", and the human types "Inception"
      Then the approval asks to type "Inception"

    Scenario: A metadata refresh of a library asks to type the library name
      Given the operation of "refresh the metadata of the Movies library" is at level ask
      When the agent runs "refresh the metadata of the Movies library", and the human types "Movies"
      Then the approval asks to type "Movies"

  Rule: The plugin refuses to write a masked value back

    Scenario: A settings write with a masked token is refused
      Given the operation of "write back a masked token" is at level ask
      When the agent runs "write back a masked token"
      Then core refuses the call with the code "INVALID_PARAMS"
