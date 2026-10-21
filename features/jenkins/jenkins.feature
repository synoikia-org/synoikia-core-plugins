@id:jenkins-builds
Feature: Jenkins builds, logs and job paths
  An agent reads the builds and the console logs of Jenkins jobs at level read.
  A human types the job name to start a build with parameters.
  The plugin refuses a job path, a tree or a parameter that could show or send a secret.

  Rule: The agent reads a failed build and its log

    Scenario: The last failed build is build 41
      Given the group of "read the last failed build" is at level read
      When the agent runs "read the last failed build"
      Then the agent gets a result that contains "FAILURE"

    Scenario: The tail of the log is its last line
      Given the group of "read the last log line of build 41" is at level read
      When the agent runs "read the last log line of build 41"
      Then the agent gets a result that contains "line 40 ✓"

  Rule: A build with parameters needs the typed job name

    Scenario: The approval names the job
      Given the group of "trigger deploy on the release branch" is at level ask
      And the operation of "trigger deploy on the release branch" is at level ask
      When the agent runs "trigger deploy on the release branch", and the human types "infra/deploy app"
      Then the approval shows "on infra/deploy app:"

    Scenario: The approval shows the job path and the parameters
      Given the group of "trigger deploy on the release branch" is at level ask
      And the operation of "trigger deploy on the release branch" is at level ask
      When the agent runs "trigger deploy on the release branch", and the human types "infra/deploy app"
      Then the approval shows "/job/infra/job/deploy%20app/buildWithParameters with BRANCH=\"release\""

    Scenario: A password parameter is refused
      Given the group of "trigger deploy with a password parameter" is at level ask
      When the agent runs "trigger deploy with a password parameter", and the human approves it
      Then core refuses the call with the code "INVALID_PARAMS"

  Rule: The plugin keeps each request in the job tree and out of the secret fields

    Scenario: A job path that goes up is refused
      Given the group of "read a job outside the job tree" is at level read
      When the agent runs "read a job outside the job tree"
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A job path with an empty folder name is refused
      Given the group of "read a job with an empty folder name" is at level read
      When the agent runs "read a job with an empty folder name"
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A job path with a dot folder name is refused
      Given the group of "read a job with a dot folder name" is at level read
      When the agent runs "read a job with a dot folder name"
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A tree that names the git remote addresses is refused
      Given the group of "read build 41 with the git remote addresses" is at level read
      When the agent runs "read build 41 with the git remote addresses"
      Then core refuses the call with the code "INVALID_PARAMS"

    Scenario: A depth above 2 is refused
      Given the group of "read build 41 at depth 3" is at level read
      When the agent runs "read build 41 at depth 3"
      Then core refuses the call with the code "INVALID_PARAMS"
