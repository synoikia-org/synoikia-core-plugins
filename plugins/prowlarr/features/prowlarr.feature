Feature: Prowlarr calls
  An agent uses Prowlarr to search the indexers, to run commands and to change single items.
  A single-item write needs the approval of a human. The human does not type a literal for it.
  The approval of a write that sends data to a provider shows where the data goes.

  Rule: The agent reads Prowlarr at level read

    Scenario: The agent searches the indexers
      Given the group of "search for dune" is at level read
      When the agent runs "search for dune"
      Then the agent gets a result that contains "nzbgeek-guid-1"

    Scenario: A search result shows only the origin of a comment link
      Given the group of "search for dune" is at level read
      When the agent runs "search for dune"
      Then the agent gets a result that contains "https://privatehd.example/[REDACTED]"

  Rule: A single-item write runs when a human approves it, with no literal

    Scenario: The human approves a health check
      Given the operation of "check the health" is at level ask
      When the agent runs "check the health", and the human approves it
      Then the agent gets a result that contains "CheckHealth"

    Scenario: The human approves the delete of one indexer
      Given the operation of "delete the first indexer" is at level ask
      When the agent runs "delete the first indexer", and the human approves it
      Then the agent gets a result that contains "{}"

    Scenario: The human approves a test of the stored download client
      Given the operation of "test the stored download client" is at level ask
      When the agent runs "test the stored download client", and the human approves it
      Then the agent gets a result that contains "{}"

    Scenario: The human approves a new indexer proxy
      Given the operation of "add a vpn proxy" is at level ask
      When the agent runs "add a vpn proxy", and the human approves it
      Then the agent gets a result that contains "VPN"

  Rule: The approval of a provider write shows where the data goes

    Scenario: The approval of a new indexer proxy names each indexer that it routes
      Given the operation of "add a vpn proxy" is at level ask
      When the agent runs "add a vpn proxy", and the human approves it
      Then the approval shows "routes indexer PrivateHD (https://privatehd.example)"

    Scenario: The approval of a new indexer proxy names the tracker that it routes
      Given the operation of "add a vpn proxy" is at level ask
      When the agent runs "add a vpn proxy", and the human approves it
      Then the approval shows "routes indexer Tracker RSS (https://tracker.example)"

    Scenario: The approval of a new indexer proxy says that the traffic goes through it
      Given the operation of "add a vpn proxy" is at level ask
      When the agent runs "add a vpn proxy", and the human approves it
      Then the approval shows "goes through this proxy"

    Scenario: The approval of a new application shows its hosts
      Given the operation of "add a radarr application" is at level ask
      When the agent runs "add a radarr application", and the human approves it
      Then the approval shows "→ http://prowlarr.lan:9696, http://radarr.lan:7878"
