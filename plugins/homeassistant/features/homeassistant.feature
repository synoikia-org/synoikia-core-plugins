Feature: Home Assistant targets and guides
  The agent can name an area in place of entities. The plugin finds the entities in the area, and the
  approval names each of them. Before the agent writes an automation, a script or a scene, it must read
  the guide of that operation.

  Rule: The approval names each entity that an area holds
    Scenario: A human approves the lights of the living room
      Given the group of "light the living room" is at level ask
      When the agent runs "light the living room", and the human approves it
      Then the approval shows "on Living Room Ceiling, Reading Lamp"

  Rule: Core refuses a config write before the agent reads its guide
    Scenario: The agent edits an automation and has not read the guide
      Given the group of "rename the morning automation without its guide" is at level ask
      When the agent runs "rename the morning automation without its guide"
      Then core refuses the call with the code "ATTESTATION_REQUIRED"
