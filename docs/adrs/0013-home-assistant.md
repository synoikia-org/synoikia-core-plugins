---
status: accepted
date: 2026-09-29
---

# Home Assistant

## Context and Problem Statement

Home Assistant controls a house: locks, alarm panels, garage doors, heating and lights. Its WebSocket API lists each `domain.service` of the running instance, and a service targets entities, devices, areas, floors or labels. A target such as an area or a label can expand to a lock or a garage door. Automations, scripts and scenes are config objects that run later without a human. Which calls need a typed confirmation, and how does the plugin keep an approval true to the entities that a call reaches?

## Decision Drivers

- Unlocking a door, disarming an alarm or opening a garage is a physical-safety risk.
- A service such as `homeassistant.turn_on` or `scene.apply` can reach a lock or a garage door through its target.
- A garage door is known by its device class, not by its name. A false negative is a physical-security miss.
- An automation that is well-formed can still be wrong, and a human who approves it may not be an expert.
- A config edit must not overwrite a change that someone else made in between.

## Considered Options

- Each service is a write, with physical-safety and system locks. Locked twins apply when a resolved target is sensitive, attestation comes before config writes, and edits are a patch with a hash.
- Classify services by name.

## Decision Outcome

Chosen option: "Each service is a write, with locks and locked twins on the resolved targets". A service name says nothing reliable about its effect, so each service asks at level `ask`. The locks add a literal where safety is at stake.

**Catalog.** Each `domain.service` of the instance, plus fixed WebSocket commands declared in `plugin.yaml`. The commands cover states, config, history, logbook, dashboards, and automation, script and scene config. They also cover the area, floor, label, category, device and entity registries. There is no raw passthrough. `network.hosts` is only the instance. Service and component events start a catalog sync, and registry events refresh the registry view.

**Targets.** A service call's target expands to the concrete entities that it covers, limited to those that the service acts on. Areas, floors and labels expand through the registry view. The approval names those entities, and pre-approval rules match each resolved entity, not any one of them.

**Locks.**

| Operations                                                                                                                      | Why                                                                                                                     | Literal                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `lock.unlock`, `lock.open`, `alarm_control_panel.alarm_disarm`                                                                  | Physical safety                                                                                                         | the entities it acts on                                  |
| `homeassistant.restart`, `homeassistant.stop`, `hassio.host_reboot`, `hassio.host_shutdown`                                     | Stops the house's controller                                                                                            | the entities, else the instance name                     |
| `hassio.restore_full`, `hassio.restore_partial`, `backup.restore`                                                               | Replaces the configuration                                                                                              | the instance name                                        |
| `cover.open_cover#garage`, `cover.toggle#garage`, `cover.set_cover_position#garage`                                             | Taken when a resolved target is a cover with device class `garage` or `gate`                                            | the entities                                             |
| `homeassistant.turn_on#protected`, `turn_off#protected`, `toggle#protected`, `scene.apply#protected`, `scene.turn_on#protected` | Taken when a resolved target is a lock, an alarm panel, or a garage door or gate. An unknown entity counts as protected | the entities. `scene.apply` names its protected entities |
| `config/automation/config/delete`, `config/script/config/delete`, `config/scene/config/delete`                                  | Deletes a config object                                                                                                 | the object's alias, else the instance name               |
| `config/{area,floor,label,category}_registry/delete`, `config/entity_registry/remove`                                           | Deletes a registry entry                                                                                                | the entry's name, else the instance name                 |

- `lock` and `alarm_control_panel` are always protected domains (`plugin.protectedDomains`). `garage` and `gate` are the garage device classes (`plugin.garageClasses`).
- The instance name is `location_name` from `get_config`.

**Attestation.** The create and update operations of automations, scripts and scenes need a `best_practice_key`. The model gets it from `guides.get` in `search`, with the guide for that operation. A human reviews the call, and the guide makes the model read the guidance before it builds the call. The guides are bundled from `guides/*.md`, and their hash is their version (core ADR-0003).

**Config edits.** Automation, script, scene and dashboard writes are a JSON Patch plus the `config_hash` that the read returned (`configTransform`).

- `prepareWrite` applies the patch to the current object. When the hash no longer matches, the call fails with `CONFIG_CONFLICT` before an approval is made.
- The approval shows a before and after diff of the changed fields.

**Secrets.** `sensitiveKeys`: `access_token`, `token`, `webhook_id`, `entity_picture`, `password`, `api_key`, `stream_source`, `still_image_url`, `code` and `pin`. Camera stream and still URLs, and entity picture URLs, carry access tokens. A lock or alarm `code` is hidden in approvals and the audit log.

### Consequences

- Good, because a lock, an alarm or a garage door always needs a typed confirmation. That holds also when a call reaches it through an area or a label.
- Good, because an unknown entity counts as protected, so a missing device class fails closed.
- Good, because a config edit cannot overwrite a change made in between, and the approver sees a diff.
- Bad, because each service, also a light, asks at level `ask` until an admin opens its group.

The feature file in `features/homeassistant/` and `plugins/homeassistant/test/compliance.yaml` specify the behavior.
