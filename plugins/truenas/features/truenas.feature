Feature: TrueNAS writes and new credentials
  A human approves each write to TrueNAS. The approval shows the method and its positional params.
  Some locked methods make a new API key, a token, a one-time password or a dataset key.
  The agent never gets that new secret.

  Rule: The approval of a write shows the method and its params
    Scenario: A human approves a new dataset
      Given the group of "create the dataset tank/apps" is at level ask
      When the agent runs "create the dataset tank/apps", and the human approves it
      Then the approval shows 'TrueNAS pool.dataset.create({"name":"tank/apps"})'

  Rule: The agent never gets a new credential
    Scenario Outline: The result of "<call>" hides the new secret
      Given the operation of "<call>" is at level ask
      When the agent runs "<call>", and the human types "<literal>"
      Then the agent gets a result that contains "[REDACTED]"

      Examples:
        | call                         | literal    |
        | create an API key for root   | root       |
        | generate a session token     | nas01      |
        | generate a one-time password | nas01      |
        | export the key of tank/media | tank/media |
