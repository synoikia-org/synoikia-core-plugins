Feature: Nginx Proxy Manager hosts, certificates and 2FA secrets
  An agent lists the proxy hosts at level read, and renews or requests a certificate when a human approves it.
  Raw nginx config in a 404 host needs its own level and the typed domain.
  A new 2FA secret goes to the user, but the agent gets it masked.

  Rule: The agent reads the proxy hosts with their certificates

    Scenario: The list of proxy hosts names the certificate
      Given the group of "list the proxy hosts with their certificates" is at level read
      When the agent runs "list the proxy hosts with their certificates"
      Then the agent gets a result that contains "Home wildcard"

  Rule: A human approves each certificate renewal and request

    Scenario: The approval of a renewal names the certificate
      Given the group of "renew certificate 1" is at level ask
      When the agent runs "renew certificate 1", and the human approves it
      Then the approval shows "Nginx Proxy Manager POST /nginx/certificates/1/renew"

    Scenario: The approved renewal returns the certificate
      Given the group of "renew certificate 1" is at level ask
      When the agent runs "renew certificate 1", and the human approves it
      Then the agent gets a result that contains "Home wildcard"

    Scenario: The approval of a certificate request names its domains
      Given the group of "request a wildcard certificate" is at level ask
      When the agent runs "request a wildcard certificate", and the human approves it
      Then the approval shows "*.home.example"

  Rule: Raw nginx config in a 404 host needs its own level

    Scenario: A human approves a plain 404 host
      Given the group of "create a parked 404 host" is at level ask
      When the agent runs "create a parked 404 host", and the human approves it
      Then the agent gets a result that contains "parked.home.example"

    Scenario: The level of the group does not reach raw nginx config
      Given the group of "create a parked 404 host with raw nginx config" is at level ask
      When the agent runs "create a parked 404 host with raw nginx config", and the human approves it
      Then core refuses the call with the code "OPERATION_DISABLED"

    Scenario: Raw nginx config runs with the typed domain at its own level
      Given the operation of "create a parked 404 host with raw nginx config" is at level ask
      When the agent runs "create a parked 404 host with raw nginx config", and the human types "parked.home.example"
      Then the agent gets a result that contains "parked.home.example"

  Rule: The agent gets each new 2FA secret masked

    Scenario: A new 2FA secret is masked
      Given the operation of "create the 2FA secret of alex" is at level ask
      When the agent runs "create the 2FA secret of alex", and the human types "alex@home.example"
      Then the agent gets a result that contains "[REDACTED]"

    Scenario: The backup codes of a new 2FA are masked
      Given the operation of "enable 2FA for alex" is at level ask
      When the agent runs "enable 2FA for alex", and the human types "alex@home.example"
      Then the agent gets a result that contains "[REDACTED]"
