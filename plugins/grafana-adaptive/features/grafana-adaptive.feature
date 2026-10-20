Feature: Grafana Adaptive rules and paths
  A human approves each change to the Adaptive rules before it runs. The approval shows what each rule drops or aggregates.
  The plugin refuses a change on rules that changed after the agent read them, and a path that leaves its template.

  Rule: The approval of the recommended rules shows what they aggregate

    Scenario: The approval of the recommended rules names the new aggregation
      Given the operation of "apply the recommended rules" is at level ask
      When the agent runs "apply the recommended rules", and the human types "100001"
      Then the approval shows 'aggregates: "container_cpu_usage_seconds_total" aggregated (drop labels "id")'

    Scenario: The recommended rules replace the rules after the human types the instance id
      Given the operation of "apply the recommended rules" is at level ask
      When the agent runs "apply the recommended rules", and the human types "100001"
      Then the agent gets a result that contains "v2"

  Rule: The plugin refuses a rules change with a stale etag

    Scenario: A rules change with a stale etag is refused
      Given the operation of "replace the rules with a stale etag" is at level ask
      When the agent runs "replace the rules with a stale etag", and the human types "100001"
      Then core refuses the call with the code "INVALID_PARAMS"

  Rule: The plugin refuses a path parameter that leaves its template

    Scenario: A policy id one level up is refused
      Given the group of "read a policy one level up" is at level read
      When the agent runs "read a policy one level up"
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A policy id that names the recommendations is refused
      Given the group of "read the recommendations as a policy" is at level read
      When the agent runs "read the recommendations as a policy"
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A policy id with a query is refused
      Given the group of "read a policy with a query in its id" is at level read
      When the agent runs "read a policy with a query in its id"
      Then core refuses the call with the code "INVALID_PARAMS"
