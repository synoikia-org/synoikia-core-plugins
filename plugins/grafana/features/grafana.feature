Feature: Grafana approvals and results
  A human approves each Grafana write before it runs. The approval shows each data source and each destination that the call affects.
  The plugin refuses a body that Grafana can read in a different way than the approval shows it.

  Rule: The approval of a data source query names each data source

    Scenario: The approval names each data source that a query reads
      Given the operation of "query two data sources" is at level ask
      When the agent runs "query two data sources", and the human approves it
      Then the approval shows "on Prometheus (prometheus, http://prometheus:9090), mysql-prod"

    Scenario: The query runs after the human approves it
      Given the operation of "query two data sources" is at level ask
      When the agent runs "query two data sources", and the human approves it
      Then the agent gets a result that contains "frames"

  Rule: The approval of a write names the operation

    Scenario: The approval of a new annotation names its operation
      Given the operation of "add an annotation" is at level ask
      When the agent runs "add an annotation", and the human approves it
      Then the approval shows "Grafana POST /annotations"

  Rule: A new credential does not reach the agent

    Scenario: The key of a new service account token is hidden
      Given the operation of "add a service account token" is at level ask
      When the agent runs "add a service account token", and the human types "synoikia-bot"
      Then the agent gets a result that contains "[REDACTED]"

    Scenario: The delete key of a new snapshot is hidden
      Given the operation of "take a snapshot" is at level ask
      When the agent runs "take a snapshot", and the human types "Main Org."
      Then the agent gets a result that contains "[REDACTED]"

  Rule: The approval of a data source change shows the new URL

    Scenario: The approval shows the new URL of a data source that the call names by id
      Given the operation of "move a data source by id" is at level ask
      When the agent runs "move a data source by id", and the human types "Prometheus"
      Then the approval shows "http://elsewhere.example.net:9090"

    Scenario: The approval shows the new URL of a data source that the call names by uid
      Given the operation of "move a data source by uid" is at level ask
      When the agent runs "move a data source by uid", and the human types "Prometheus"
      Then the approval shows "http://elsewhere.example.net:9090"

  Rule: The plugin refuses a body key that Grafana reads as a different field

    Scenario: A query with a Datasource key is refused
      Given the operation of "query with a Datasource key" is at level ask
      When the agent runs "query with a Datasource key", and the human approves it
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A data source with a URL key is refused
      Given the operation of "add a data source with a URL key" is at level ask
      When the agent runs "add a data source with a URL key", and the human types "Main Org."
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A contact point with a long-s settings key is refused
      Given the operation of "add a contact point with a long-s settings key" is at level ask
      When the agent runs "add a contact point with a long-s settings key", and the human types "Main Org."
      Then core refuses the call with the code "INVALID_PARAMS"

  Rule: The approval of a contact point shows only the host of its URL

    Scenario: The approval shows the host of a URL that the body sends as Settings.URL
      Given the operation of "add a contact point with Settings.URL" is at level ask
      When the agent runs "add a contact point with Settings.URL", and the human types "Main Org."
      Then the approval shows "hooks.slack.com (contact point URL)"

  Rule: The approval of an SSO settings change names the provider

    Scenario: The approval of a change to the GitHub SSO settings names GitHub
      Given the operation of "change the GitHub SSO settings" is at level ask
      When the agent runs "change the GitHub SSO settings", and the human types "Main Org."
      Then the approval shows "on github (SSO provider)"
