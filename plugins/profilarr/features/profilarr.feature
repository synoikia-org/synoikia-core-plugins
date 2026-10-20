Feature: Profilarr calls
  An agent uses Profilarr to read its status and its arr instances, and to make backups.
  A backup needs the approval of a human. The human does not type a literal for it.

  Rule: The agent reads Profilarr at level read

    Scenario: The agent reads the version of Profilarr
      Given the group of "read the status" is at level read
      When the agent runs "read the status"
      Then the agent gets a result that contains "2.2.0"

    Scenario: The agent lists the arr instances
      Given the group of "list the arr instances" is at level read
      When the agent runs "list the arr instances"
      Then the agent gets a result that contains "Radarr"

    Scenario: The API key of an arr instance is masked
      Given the group of "list the arr instances" is at level read
      When the agent runs "list the arr instances"
      Then the agent gets a result that contains "[REDACTED]"

  Rule: A backup runs when a human approves it, with no literal

    Scenario: The human approves a backup
      Given the operation of "create a backup" is at level ask
      When the agent runs "create a backup", and the human approves it
      Then the agent gets a result that contains "jobId"

    Scenario: The approval of a backup names the operation
      Given the operation of "create a backup" is at level ask
      When the agent runs "create a backup", and the human approves it
      Then the approval shows "Profilarr POST /backups"
