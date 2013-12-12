Grimwire 0.5.2 (beta)
===================

A node.js server for connecting client-side applications using [WebRTC](//webrtc.org) and the [Local.js Ajax Library](//github.com/grimwire/local).

### Overview

Grimwire is a downloadable node.js "relay" for users to establish WebRTC connections between their Web applications. Every connected page is assigned a URL and setup to handle Web requests using HTTPL. A service-discovery system then configures the applications into a personal Web.

### How?

Users register with relays - Grimwire instances - which run as traditional Web services on registered hostnames. Then, users authorize 3rd-party apps to subscribe to streams on the relay and exchange connection information with the other applications. When apps join, they are assigned URLs (which look like `httpl://bob@bobs-relay.com!bobs-app.com`). Apps can then register and fetch links from the relay and use ["relation types"](http://tools.ietf.org/html/rfc5988#section-5.3) to determine compatibility.

Once connected, apps use HTTPL - a messaging protocol similar to HTTP - to make Ajax requests to each other. This is handled by the [Local.js library](//github.com/grimwire/local), which provides a promises-based Ajax interface and a server API similar to node.js. The apps then register server functions to handle the requests and (using attached peer info) make permission decisions.

---

*Grimwire is in public beta. For bugs and suggestions, submit reports to [github.com/grimwire/grimwire/issues](//github.com/grimwire/grimwire/issues).*

---


## Basic Usage

### Installing a Relay

```
git clone https://github.com/grimwire/grimwire.git grimwire
cd grimwire
./grimwire setup
./grimwire start
```

This gets the relay started on port 8000. You can choose another port with the '-p' flag, eg `./grimwire start -p 80`. More config options are explained in the "Administration" portion of this doc.

### Trying it out with chat.grimwire.com

Open [chat.grimwire.com](http://chat.grimwire.com). Click the G on the top right, enter the address of your relay, then press enter. Grant access.

Now that you're logged in, the chat app will query the relay for any rooms hosted by the other users. If nothing shows up, you can start your own with the green *Start a room* button. Other users are free to join the room and you'll have a private, encrypted chat.

### Also, FYI

**Save Time with the Bookmarklet**: Since entering your relay's address is tedious, Grimwire provides a bookmarklet that allows you to connect the GrimWidget to your relay automatically. Find it on the right side of the dashboard after logging in.

**Set your Avatar Icon**: In your relay's dashboard, you should notice your username and a down-arrow on the top right. Click that, then select from the "Change Avatar" submenu.

**Add Guest Slots**: (BETA FEATURE) People without accounts can borrow guest streams by specifying your username as a host. If you plan to host guests, allocate streams on the right side of the dashboard.


## Developing Applications for Grimwire

See the [Local.js Manual](http://grimwire.com/local) for writing software using Grimwire.


## Features to come:

 - Connecting to users on other relays. Currently, bob@bobs-relay.com can not reach alice@alices-relay.com because the two relays can't talk to each other. Inter-relay connections should be available before Grimwire leaves beta.
 - Only allowing WebRTC traffic (disabling relay bouncing). When WebRTC fails to create a connection, the traffic is routed ("bounced") through the relay. This keeps the experience smooth, but may be undesirable in some cases.
 - Choosing who can connect to you. Currently, anybody on the relay can initiate a connection or send traffic to you.


## Administration (Running a Relay)

### Configuring the Relay Service

The `grimwire` program supports the following commands:

 - `grimwire start`: starts the server.
 - `grimwire setup`: downloads javascript dependencies and creates the config files if they don't exist.
 - `grimwire reload`: reloads config and user files into the existing process without downtime.
 - `grimwire stop`: sends a "shutdown" signal to the existing process.

Grimwire's configuration can be controlled with command-line flags or the config.json file. CLI flags always take precedence over config.json's values. The flags are:

 - `-p/--port`: the port to bind the server to (default 8000).
 - `-h/--hostname`: the hostname the relay uses when linking to itself (defaults to system value).
 - `-u/--is_upstream`: if grimwire is upstream of a server like Nginx, specify this flag with the port the server is using.
 - `--ssl`: enables TLS, and will look for `ssl-key.pem` and `ssl-cert.pem` in grimwire's directory to set the key & cert (default off).
 - `--allow_signup`: if set to 0, will remove the new-user signup interface from the login page (default 1).
 - `--max_accounts`: the limit on the number of user accounts that can register (default 100).
 - `--max_user_streams`: the limit on the streams a user can hold at once. Can be overridden per-user by setting `"max_user_streams"` in the userfile (default 10).

The `config.json` file can include any of the long versions of those flags. Note that `grimwire reload` will not update the port or SSL status - you must restart the server process to do that.

**A config.json for using SSL**

```
{
	"ssl": true
}
```

The port will default to 443. The `ssl-key.pem` and `ssl-cert.pem` files (under grimwire's installed directory) will be used for encryption.

**A config.json for using a Front Proxy (like Nginx) without SSL**

```
{
	"port": 8000,
	"is_upstream": 80
}
```

This is saying, "nginx runs for the public at port 80, and it contacts grimwire at port 8000".

**A config.json for using a Front Proxy (like Nginx) with SSL**

```
{
	"port": 8000,
	"is_upstream": 443,
	"ssl": true
}
```

This is saying, "nginx runs for the public at port 443 using SSL, and it contacts grimwire at port 8000". Note, in this case, grimwire will *not* load `ssl-key.pem` and `ssl-cert.pem` or use the nodejs SSL utilities. Since it's in upstream mode, it assumes that the frontend proxy handles the SSL.

### Setting the Welcome Message and Dashboard MOTD

You can change the HTML on the right of the login interface by editing welcome.html. You can change the HTML on the right of the dashboard by editing motd.html. Grimwire's relay uses Bootstrap 3's CSS.

### Adding, Editing, and Removing Users

Users are stored as extensionless JSON files in the `users` directory under grimwire. For instance, the userfile for 'bob' would be found at `grimwire_install_dir/users/bob`. His file should look something like this:

```
{
    "id": "bob",
    "email": "bob@bobberson.com",
    "password": "$2a$10$8RJaSIdDMvix4PRbF2F5vut4kDKyqvQX0w/59YCrL4sk0zMaULtZ2",
    "avatar": "user.png",
    "created_at": "2013-10-21T23:28:28.077Z"
}
```

You can add new users by creating files which follow this format, or edit a user's details by changing their file. Likewise, you can remove a user by deleting their userfile. Any changes you make, however, won't make their way into the relay process until you reload (`grimwire reload`) or restart it.

If you want to change a user's password, you can set it as plaintext in the JSON. When the userfile is loaded, Grimwire will encrypt the password and rewrite the file.


## Discussion Topics

### What exactly is WebRTC?

WebRTC (Real Time Communication) is a new set of technologies for browsers, predominantly developed by Google and Mozilla. It adds a lot of strong features to the Web, including:

 - "NAT Traversal". Few users on the Internet have their own address, and, even when they do, their firewalls tend to stop incoming connections. It's actually a good thing, since the blocking makes it harder for attacks to hit your computer. However, in the cases where you do want to accept connections, you need to "puncture" the firewall by sending out-going messages and finding an ideal pathway. WebRTC's NAT Traversal, combined with relays like Grimwire, does that for you - selectively, without removing the defenses.

 - Audio/Video/Data streaming. Connections can be established for video- and audio-calls, data-streaming for games and realtime apps, and screen-sharing. Applications using Grimwire can easily take advantage of the audio/video, but Grimwire's primary focus is on the data.

 - Encrypted data-streams. Just like on sites that use https, WebRTC's data streams have "Transport Layer Security" - encryption of the messages. Grimwire always uses this, so somebody that's snooping on the network can't see the content of your traffic.

### How much user-tracking can be done with Grimwire?

This depends on the situation. Let's look at the individual pieces and what information they expose.

#### Tracking by the Relays

Relays are in the best position to track users - because they're designed to! In order for WebRTC to break through firewalls, there has to be a public service that can carry session information between the users. This means a relay knows what apps you have online and who you've exchanged session details with. Grimwire doesn't currently log that information, but it would be trivial for a host to add the logging themselves.

Should this worry you? It's tempting to compare this information to, say, being seen at a coffee shop by the shop manager. However, that manager also sees you at the other shops, notices every conversation you start, and (with logging added) never forgets anything. That's pretty spooky.

This is why Grimwire's relay doesn't run as one big service - that information is better left unaggregated. Further, governments may compel Web providers to install taps or provide backdoors. It's best to decentralize the system across lots of machines to decrease the impact of leaks.

I recommend that families, friends, university groups, businesses, etc (communities with real-world contact) run their own relays so that users don't have to put their trust in strangers. In the future, Grimwire's relays will be able to inter-communicate, and that will allow you to expand your network without exposing yourself to additional tracking.

#### Tracking by the Applications

By granting access to an application, you give it the ability to see who/what is on the relay and to start new connections. This is less information than the tracker gets - it's more like the app can walk up to the coffee-shop manager (from the previous analogy) and ask what the current situation is. Still, it's a fairly large amount of info, so be mindful of who you authorize.

In a future release, Grimwire will support different levels of authorization that determines what the apps can see and connect to.

#### Tracking by the Network

Grimwire uses Transport Layer Security, which means it encrypts the data that passes over the wire. However, a determined snoop could log all of the encrypted data and attempt to crack the encryption in the future. This situation is generally uncommon, but still feasible. As a result, you should be aware of which networks your programs use:

 - If you're connecting over the Internet, its likely your messages are logged.
 - If you're connecting over a LAN, your messages may be logged, but probably not by people who can crack the encryption.
 - If you're connecting between tabs on your machine - and WebRTC is working, so bouncing is not in use - the data never leaves your machine. Flawless victory!


## Credits

CSS by <a href="http://getbootstrap.com/" target="_blank">Bootstrap</a>. Icons by <a href="http://www.fatcow.com/free-icons" target="_blank">FatCow</a> and <a href="http://glyphicons.com/" target="_blank">Glyphicons</a>. Uses JS libraries by <a href="http://stevenlevithan.com/" target="_blank">Stephen Levithan, </a><a href="https://github.com/fxa" target="_blank">Franz Antesberger</a>, and <a href="https://github.com/federomero" target="_blank">Federico Romero</a>. Grimwire by <a href="https://github.com/pfraze" target="_blank">Paul Frazee</a>.


## License

The MIT License (MIT) Copyright (c) 2013 Paul Frazee

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
