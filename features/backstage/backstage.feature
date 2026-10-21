@id:backstage-catalog
Feature: Backstage catalog and scaffolder calls
  An agent reads the Backstage catalog page by page and validates entities at level read.
  A human approves each refresh and each dry-run of a template.

  Rule: The catalog gives its entities page by page

    Scenario: The first page holds the first component
      Given the group of "read the first component" is at level read
      When the agent runs "read the first component"
      Then the agent gets a result that contains "petstore"

    Scenario: The cursor of the first page gives the next component
      Given the group of "read the next component" is at level read
      When the agent runs "read the next component"
      Then the agent gets a result that contains "billing"

  Rule: Backstage refuses an entity that is not valid

    Scenario: An entity with no name is not valid
      Given the group of "validate an entity with no name" is at level read
      When the agent runs "validate an entity with no name"
      Then core refuses the call with the code "INVALID_PARAMS"

  Rule: A human approves each refresh and each dry-run

    Scenario: The approval of a refresh names the entity
      Given the group of "refresh petstore" is at level ask
      When the agent runs "refresh petstore", and the human approves it
      Then the approval shows "component:default/petstore"

    Scenario: A dry-run is off at level read
      Given the group of "dry-run the checkout template" is at level read
      When the agent runs "dry-run the checkout template"
      Then core refuses the call with the code "OPERATION_DISABLED"

    Scenario: An approved dry-run returns the files of the template
      Given the group of "dry-run the checkout template" is at level ask
      When the agent runs "dry-run the checkout template", and the human approves it
      Then the agent gets a result that contains "ZXlKLmJhY2tzdGFnZS11c2VyLXRva2VuLjU1NTU1NQ=="
