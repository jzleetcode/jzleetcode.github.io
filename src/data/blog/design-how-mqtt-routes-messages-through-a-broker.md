---
author: JZ
pubDatetime: 2026-11-25T19:29:55Z
modDatetime: 2026-11-25T19:29:55Z
title: System Design - How MQTT Routes Messages Through a Broker
tags:
  - design-system
  - design-messaging
  - design-network
description: "Follow an IoT message from publisher to subscriber, then compare MQTT QoS, retained messages, and persistent sessions."
---

## Table of contents

- [A sensor does not need to know its readers](#a-sensor-does-not-need-to-know-its-readers)
- [Topics let the broker route messages](#topics-let-the-broker-route-messages)
- [QoS is a delivery promise](#qos-is-a-delivery-promise)
- [Sessions preserve selected state across disconnects](#sessions-preserve-selected-state-across-disconnects)
- [Choose settings for the kind of message](#choose-settings-for-the-kind-of-message)

## A sensor does not need to know its readers

Imagine that a temperature sensor in a factory reports a new reading every few seconds. The dashboard needs the reading to draw a chart. An alert service needs it to detect overheating. The sensor should not need a separate connection to each reader or know which applications are online.

MQTT solves this with a **publish/subscribe** model. Clients connect to a broker. A publisher sends a message to a named topic, and the broker forwards it to clients whose subscriptions match that topic.

```text
Temperature sensor
  PUBLISH topic: factory/line-4/temperature
             |
             v
       +-----------+
       |  Broker   |
       +-----+-----+
             |
      +------+------------------+
      |                         |
      v                         v
Dashboard subscribes       Alert service subscribes
factory/+/temperature       factory/line-4/#
```

The sensor can publish once even if many applications want the value. The broker handles routing and fan-out. Publishers and subscribers can come and go independently, subject to the session and delivery settings they choose.

## Topics let the broker route messages

A topic is a UTF-8 string divided into levels by the slash character. For example:

```text
factory/line-4/temperature
```

A client subscribes with a **topic filter**. The plus sign matches one level, while the number sign matches the remaining levels and must appear at the end:

| Filter                             | Matches                                      |
| ---------------------------------- | -------------------------------------------- |
| <code>factory/+/temperature</code> | A temperature topic for any one factory line |
| <code>factory/line-4/#</code>      | The line-4 topic and all of its subtopics    |
| <code>factory/#</code>             | The factory topic and all of its subtopics   |

When a message arrives, the broker finds matching subscriptions and forwards a copy to each subscriber. The subscriber does not have to be connected when the publisher sends the message unless the subscriber wants the broker to keep a session and queue eligible messages for later.

MQTT messages also carry a **Quality of Service (QoS)** level. QoS affects how sender and receiver acknowledge delivery. It does not change topic matching, and it is negotiated for each delivery hop: from publisher to broker, then from broker to subscriber.

## QoS is a delivery promise

MQTT offers three QoS levels. Higher levels add protocol state and round trips so a sender can distinguish a successful delivery from a lost acknowledgement.

| QoS | Delivery guarantee                    | Exchange                                                                                | Useful when                                                                             |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0   | At most once                          | One <code>PUBLISH</code>; no MQTT acknowledgement                                       | The next reading will arrive soon and a missed reading is acceptable                    |
| 1   | At least once                         | <code>PUBLISH</code>, then <code>PUBACK</code>                                          | Delivery matters, and the consumer can tolerate or remove duplicates                    |
| 2   | Exactly once at the MQTT delivery hop | <code>PUBLISH</code> → <code>PUBREC</code> → <code>PUBREL</code> → <code>PUBCOMP</code> | Duplicate delivery is costly enough to justify extra messages and stored protocol state |

With QoS 0, the sender does not wait for the MQTT receiver to confirm the message. With QoS 1, a missing acknowledgement makes the sender retry; if the receiver handled the message but its acknowledgement was lost, the receiver can see the message again. Consumers should therefore make important actions idempotent.

QoS 2 adds a four-step handshake. The receiver records the message when it sends <code>PUBREC</code>. The sender then sends <code>PUBREL</code>, and the receiver sends <code>PUBCOMP</code> when that delivery is complete. The protocol state prevents the same QoS 2 message from being delivered twice on that hop.

“Exactly once” has a boundary: it describes MQTT's delivery protocol between a sender and receiver. It does not make a payment, database update, or downstream job exactly once if the application performs that side effect outside the MQTT protocol. For business actions, keep an application-level idempotency key or transactional record.

The broker also respects the subscriber's requested maximum QoS. A message published at QoS 2 can reach a subscriber at QoS 1 if that subscription requests QoS 1. Pick the QoS for each message type instead of assuming that one setting makes the whole system exactly once.

## Sessions preserve selected state across disconnects

Sensors, phones, and network links disconnect. MQTT lets a client decide whether the broker should remember session state beyond the connection.

In MQTT 5, **Clean Start** says whether to begin a new session, and **Session Expiry Interval** says how long the broker may keep that session after disconnect. A persistent session can preserve subscriptions and queue eligible QoS 1 or QoS 2 messages for the client to receive after it reconnects. Broker limits and message-expiry settings still apply.

The **retain** flag solves a different problem. If a publisher marks a message as retained, the broker keeps the latest retained value for that topic. A new subscriber can receive that value immediately instead of waiting for the next publish. A retained temperature reading is useful as the current known temperature; retained messages are not an event history. Publishing an empty retained payload removes the stored value for that topic.

A client can also set a **Last Will and Testament** message when it connects. If it disconnects unexpectedly and the broker detects the failure, the broker publishes the configured will. A device might use this to publish <code>factory/line-4/status = offline</code>. A normal MQTT disconnect does not trigger the will.

## Choose settings for the kind of message

An MQTT client identifies itself with a client ID and connects with settings such as keep-alive, credentials, session behavior, and a Will. The broker uses subscriptions to route messages and can apply access rules to topics.

For the factory example, the choices might look like this:

- Use QoS 0 for frequent temperature samples when the next sample quickly replaces a missed one.
- Use QoS 1 for an alarm that should reach the alert service, and make the alert handler safe to retry.
- Use QoS 2 only when avoiding a duplicate at the MQTT layer justifies its extra handshake.
- Retain a device's latest status, but do not use retained messages as an audit log.
- Give a dashboard a persistent session only if it should receive queued messages after reconnecting.
- Use TLS and topic-level authorization so one device cannot publish commands or read another device's data.

Keep-alive helps the broker notice an unresponsive client, but it is not an application health check. A broker may also apply queue limits, expiry, and offline-session policies, so a persistent session is not an unlimited durable message store.

The key idea is that MQTT separates **who publishes**, **which topic describes the message**, and **which subscribers match**. QoS, sessions, and retained state then let each application choose how much reliability and memory it needs.

## References

1. OASIS, [MQTT Version 5.0](https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html), the protocol specification.
2. HiveMQ, [MQTT Quality of Service levels](https://www.hivemq.com/blog/mqtt-essentials-part-6-mqtt-quality-of-service-levels/), with packet flows and delivery trade-offs.
3. AWS IoT Core, [MQTT](https://docs.aws.amazon.com/iot/latest/developerguide/mqtt.html), including QoS, retained messages, persistent sessions, and Last Will behavior in a deployed broker.
4. [MQTT.org](https://mqtt.org/), an overview of the protocol and its ecosystem.
