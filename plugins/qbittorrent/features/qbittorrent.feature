Feature: qBittorrent approvals and masked URLs
  A human approves each write to qBittorrent. The approval names the torrents, categories, tags, feeds and rules
  that the write changes, and the places where it puts data. Tracker URLs can hold a passkey, so the agent sees
  only the origin of each URL.

  Rule: A regular write shows what it changes and asks for no typed literal
    Scenario: A human stops one torrent
      Given the operation of "stop the Debian torrent" is at level ask
      When the agent runs "stop the Debian torrent", and the human approves it
      Then the approval shows 'qBittorrent torrents.stop on torrent "Debian 12 Netinst"'

    Scenario Outline: The approval of <call> shows its effect
      Given the operation of "<call>" is at level ask
      When the agent runs "<call>", and the human approves it
      Then the approval shows '<shows>'

      Examples:
        | call | shows |
      | torrents.delete | on torrent "Ubuntu 24.04 Desktop": remove, keep the downloaded files |
      | torrents.delete (two torrents) | 2 torrents: "Ubuntu 24.04 Desktop", "Big Buck Bunny" |
      | torrents.delete (all) | on all 3 torrents |
      | torrents.add | into "/downloads" (the default save path) on qBittorrent at 127.0.0.1: 1 source(s): magnet "Fedora 42"; magnet trackers, sources, peers and DHT nodes: https://private.example |
      | torrents.add (automatic management) | into "/downloads/tv/shows" (automatic management, category "tv/shows"; savepath "/elsewhere" is ignored) |
      | torrents.setLocation | to "/archive" for torrent |
      | torrents.setSavePath | to "/media/films" for torrent |
      | torrents.editCategory | on category "linux": save path "/srv/linux" |
      | torrents.createCategory (paths) | on category "archive": create with save path "/srv/archive" |
      | torrents.removeCategories | on category "movies": delete |
      | torrents.deleteTags | on tag "iso" |
      | torrents.addTrackers | add trackers https://new.example |
      | torrents.editTracker | tracker udp://open.example:1337 to https://other.example |
      | torrents.removeTrackers | remove trackers https://private.example |
      | torrents.setShareLimits (remove with content) | then RemoveWithContent |
      | torrents.stop (all) | on all 3 torrents |
      | torrents.setCategory (all) | move to "/downloads/movies" |
      | torrents.setDownloadLimit (all) | download limit 1000 B/s |
      | rss.addFeed | subscribe "New feed" to https://new-feed.example |
      | rss.setFeedURL | on feed "Public": URL to https://mirror.example |
      | rss.removeItem | remove the folder and its 1 feed(s) |
      | rss.setRule | on rule "Ubuntu" (replaced): saves to "/downloads/linux", category "linux", from feeds https://public.example |
      | rss.setRule (new rule) | on new rule "Debian" on qBittorrent at 127.0.0.1: saves to "/downloads" (the default save path), from feeds https://feeds.example |
      | rss.removeRule | on rule "Ubuntu": delete |

  Rule: A locked write on many torrents or plugins names all of them
    Scenario Outline: The approval of <call> names its targets
      Given the operation of "<call>" is at level ask
      When the agent runs "<call>", and the human types "<literal>"
      Then the approval shows '<shows>'

      Examples:
        | call | literal | shows |
      | torrents.delete#with-files (all) | all 3 torrents | on all 3 torrents: remove, deleting the downloaded files |
      | search.start (all plugins) | 127.0.0.1 | with plugins "example"; including disabled: "legacy" |

  Rule: Core refuses a locked delete that nobody confirms
    Scenario: No human is there to type the literal
      Given the operation of "delete the Ubuntu torrent and its files" is at level ask
      When the agent runs "delete the Ubuntu torrent and its files"
      Then core refuses the call with the code "PERMISSION_DENIED"

    Scenario: The torrent is not in qBittorrent
      Given the operation of "delete a torrent that qBittorrent does not have" is at level ask
      When the agent runs "delete a torrent that qBittorrent does not have", and the human types "127.0.0.1"
      Then core refuses the call with the code "PLUGIN_ERROR"

  Rule: The agent sees only the origin of a tracker URL
    Scenario: A private tracker URL is masked
      Given the group of "list the trackers of the Debian torrent" is at level read
      When the agent runs "list the trackers of the Debian torrent"
      Then the agent gets a result that contains "https://private.example/<masked:"
