@id:seerr-requests
Feature: Seerr media requests
  The agent asks Seerr for a movie or a series for its own Seerr user. A human approves each request.
  The approval shows the full request, the quality included, so that a rule can approve standard quality only.

  Rule: The approval of a media request shows the quality
    Scenario: A request with no 4K value asks for standard quality
      Given the operation of "request The Matrix" is at level ask
      When the agent runs "request The Matrix", and the human approves it
      Then the approval shows '/request {"mediaType":"movie","mediaId":550,"is4k":false}'

  Rule: A request of the plugin user is a regular write
    Scenario: A human approves the request of the plugin user with no typed literal
      Given the group of "approve the request of the plugin user" is at level ask
      When the agent runs "approve the request of the plugin user", and the human approves it
      Then the agent gets a result that contains '"status":2'
