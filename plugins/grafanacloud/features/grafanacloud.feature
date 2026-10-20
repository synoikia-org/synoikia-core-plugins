@id:grafanacloud-approvals
Feature: Grafana Cloud approvals and results
  A human approves each Grafana Cloud write before it runs. The approval shows the privileges that a call gives, the code that it installs and the data that it removes.
  The plugin refuses a body that grafana.com can read in a different way than the approval shows it.

  Rule: The approval of an access policy shows its privileges

    Scenario: The approval of a new access policy shows its scopes
      Given the operation of "add an org access policy" is at level ask
      When the agent runs "add an org access policy", and the human types "org-writers"
      Then the approval shows 'scopes=["metrics:write","stacks:write"]'

    Scenario: The approval of a changed access policy shows its new scopes
      Given the operation of "widen an access policy" is at level ask
      When the agent runs "widen an access policy", and the human types "stack-readers"
      Then the approval shows 'scopes=["metrics:read","accesspolicies:write"]'

  Rule: The approval of a stack plugin install shows that it installs code

    Scenario: The approval of a plugin install names third-party plugin code
      Given the operation of "install a stack plugin" is at level ask
      When the agent runs "install a stack plugin", and the human types "acme-prod"
      Then the approval shows "third-party plugin code"

  Rule: The approval of a stack delete shows that it cannot be undone

    Scenario: The approval of a stack delete by instance id shows that it cannot be undone
      Given the operation of "delete a stack by instance id" is at level ask
      When the agent runs "delete a stack by instance id", and the human types "acme-prod"
      Then the approval shows "this cannot be undone"

    Scenario: The approval of a stack delete shows that it cannot be undone
      Given the operation of "delete a stack" is at level ask
      When the agent runs "delete a stack", and the human types "acme-prod"
      Then the approval shows "this cannot be undone"

  Rule: A new token does not reach the agent

    Scenario: A new Cloud token is hidden
      Given the operation of "add a Cloud token" is at level ask
      When the agent runs "add a Cloud token", and the human types "stack-readers"
      Then the agent gets a result that contains "[REDACTED]"

    Scenario: A new stack service account token is hidden
      Given the operation of "add a stack service account token" is at level ask
      When the agent runs "add a stack service account token", and the human types "synoikia-bot"
      Then the agent gets a result that contains "[REDACTED]"

  Rule: The plugin refuses a body key that grafana.com reads as a different field

    Scenario: A token with an AccessPolicyId key is refused
      Given the operation of "add a token with an AccessPolicyId key" is at level ask
      When the agent runs "add a token with an AccessPolicyId key", and the human types "stack-readers"
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A policy with a Scopes key is refused
      Given the operation of "add a policy with a Scopes key" is at level ask
      When the agent runs "add a policy with a Scopes key", and the human types "r"
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A policy with a long-s scopes key is refused
      Given the operation of "add a policy with a long-s scopes key" is at level ask
      When the agent runs "add a policy with a long-s scopes key", and the human types "r"
      Then core refuses the call with the code "INVALID_PARAMS"
