# STF

Responsible for all app streaming / interaction.

### Setup

Follow the setup guide in readme. Rather than stf local you can also do npm
start.

### Guide

First look at the diagram in [this
guide](https://github.com/datadrivendesign/mobile.crowdstf/blob/master/crowdstf/doc/DEPLOYMENT.md).
This is the basic architecture of CrowdSTF. Every node on the diagram is a
separate process, and they all get launched when you run STF (except for device
processes, which get launched as devices get connected). Their names correspond
to directories in crowdstf/lib/units. So that can help you get a sense of where
things are. Ones to take note of are:

* Websocket - Handles websocket events coming from the STF front-end. Device
  inputs, along with a lot of other stuff, are sent as websocket events. This is
  also where we capture and store a lot of the user’s input data. In the diagram
  it shows multiple websocket processes but I think in our setup we just run
  one.

* App - This one actually isn’t in the diagram, but this is the Express server
  that serves the STF front-end and also exposes a REST API that gets used by
  the front-end and STF Manager. It also handles authentication (see below).

* Processor - This mostly just forwards messages from one end of the
  architecture to the other.

* Device - each device that’s connected to STF will have a device process
  running for it. Anything that involves sending/receiving messages from the
  device will happen here.

All of these different processes communicate via a service called "wire", which
is itself a wrapper around zeromq. Wire messages are always in the form of
[protocol buffers](https://developers.google.com/protocol-buffers/). All the
protocol buffer types are defined in lib/wire/wire.proto. Wire also has a
somewhat confusing “channel” abstraction that it uses to know where to send
messages to. What you need to know is that every device has its own channel so
if you want to send a message to a device process you will need to make sure you
have the right channel.

We use tokens to authenticate users. Tokens are basically one-time-use links
that can be used to gain access to STF for some amount of time. Tokens have a
device and an app associated with them, so you can use a token to refer to an
entire user session.

All of the code that gets used for the front-end is in the res/app.
