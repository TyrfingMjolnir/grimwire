The Grimwire User's Manual
==========================
version 0.4

Welcome to a new kind of social network: peer-to-peer, user-hosted, and real-time.

Grimwire uses WebRTC to connect applications directly to each other. Apps host Web services to each other from the browser, meaning your data stays on your computer and your peers'. "Relays" help you locate other users and establish connections, and will carry traffic between users if WebRTC fails. Together, your apps form a private, encrypted, real-time Web where the services are hosted by the users.

If you want to run your own private relay, read "Installing a Relay" below to get started.

---
Grimwire is in public beta. If you run into bugs or think it could do something better, email me at pfrazee@gmail.com. If you're familiar with GitHub, you can file issue reports at //github.com/grimwire/grimwire/issues.
---


## Basic Usage

### Finding a Relay

At the time of this writing, there aren't any public relays - you have to host your own or use a friend's. If any public relays get started, I'll update the manual, but keep in mind that relays are able to track the applications on their networks, and could log the traffic they bounce (which happens when WebRTC fails). Public relays are public places!

If you don't have a relay you can use, and lack the technical expertise to start your own, contact your friendly neighborhood nerd and ask them for assistance. Be sure to thank them for their hacking, and - even if they are clean-shaven - complement their neckbeard as well. This is a sign of deep respect in the hacker community.

### Installing a Relay

:TODO: see if this can be done locally

```
npm install -g grimwire
grimwire setup
sudo grimwire start
```

This gets the relay started on port 80. You can choose another port with the '-p' flag, eg `grimwire start -p8000`. More config options are explained in the "Administration" portion of this manual.

### Trying it out with chat.grimwire.com

Open http://chat.grimwire.com in your browser. Notice that Grimwire logo in the top right? That's the GrimWidget, and it should say "offline." Click on that, then enter the address of your relay in the box. A popup will ask if you want to grant chat.grimwire.com access. Click "Allow".

Once you're logged in, the chat app will query the relay for any rooms hosted by the other users. If nothing shows up, you can start your own with the green "Start a room" button. When prompted, enter a name for the room, and you should see your user join. Go ahead and try chatting - the messages should appear on the page.

If you'd like, open chat.grimwire.com in a another tab. You should automatically connect to the relay this time, and the GrimWidget should list your room. Click the blue "Join" button and try chatting. The messages should appear in both tabs! Other users are free to join the room, or you can join theirs, and you'll have a private, encrypted chat.

### Saving Time with the Bookmarklet

Since entering your relay's address is tedious, Grimwire provides a bookmarklet that allows you to connect the GrimWidget to your relay automatically.

If you navigate to your relay and log in, you should be taken to a dashboard showing all of the online apps and services. On the right side, there's a "Bookmarklet" section. Drag the "join(...)" link into your bookmarks toolbar to install the bookmarklet on your browser. Now, when you see the GrimWidget on a page, just click that bookmarklet to log in.

### Setting your Avatar Icon

In your relay's dashboard, you should notice your username and a down-arrow on the top right. Click that, then select from the "Change Avatar" submenu.

### Connecting to Users on Another Relay

For now, this is not possible - bob@bobs-relay.com can not reach alice@alices-relay.com because the two relays can't talk to each other. Inter-relay connections should be available before Grimwire leaves beta.

### Keeping All Traffic Private (no relay bouncing)

This is also not yet possible, but is planned as an addition before beta ends.

### Controlling who can Connect to You

You guessed it: also coming soon. I put these entries here just so you know they;re in the works.

### Developing Applications for Grimwire

See the Developer's Manual :TODO: for writing your own software.


## Discussion Topics

### How is this different from, say, Facebook?

Facebook uses its own systems to connect people, run applications, and store data. Most of the applications (messages, photos, groups, etc) are made and run by Facebook, but other sites can use the service to do logins, get network/user info, spam the friend feed, and so on. This tends to mean that all of Facebook's interactions occur through Facebook's computers.

Like Facebook, Grimwire's interactions occur through the Grimwire relays. However, Grimwire has only one kind of interaction: connections. After the connection, the applications interact directly from one browser to the other*. The other crucial difference is that Grimwire's relays are open-source and free for anybody to install, so users can run their own networks.

Joining a relay with an app is equivalent to setting up an ephemeral .com. Your page is assigned an address (they look like httpl://bob@bobs-relay.com!bobs-app.com) and, until you close the page, you'll be able to respond to Web requests from there. The relay keeps links to those addresses, along with information about what services those addresses provide, so apps have an easy way to find each other.

* As mentioned through-out this manual, if WebRTC - the p2p technology - fails, Grimwire's relays will "bounce" the traffic to make sure you can still connect. This trade-off was made to ensure a smooth experience, but can come at a privacy cost. If this concerns you, disable bouncing on your account (not yet implemented in beta) or use a private relay.

### What exactly is WebRTC?

WebRTC (Real Time Communication) is a new set of technologies for browsers, predominantly developed by Google and Mozilla. It adds a lot of strong features to the Web, including:

 - "NAT Traversal". Few users on the Internet have their own address, and, even when they do, their firewalls tend to stop incoming connections. It's actually a good thing, since the blocking makes it harder for attacks to hit your computer. However, in the cases where you do want to accept connections, you need to "puncture" the firewall by sending out-going messages and finding an ideal pathway. WebRTC's NAT Traversal, combined with relays like Grimwire, does that for you - selectively, without removing the defenses.

 - Audio/Video/Data streaming. Connections can be established for video- and audio-calls, data-streaming for games and realtime apps, and screen-sharing. Applications using Grimwire can easily take advantage of the audio/video, but Grimwire's primary focus is on the data.

 - Encrypted data-streams. Just like on sites that use https, WebRTC's data streams have "Transport Layer Security" - encryption of the messages. Grimwire always uses this, so somebody that's snooping on the network can't see the content of your traffic.

### How much user-tracking can be done with Grimwire?

This depends on the situation. Let's look at the individual pieces and what information they expose.

#### Tracking by the Relays

Relays are in the best position to track users - because they're designed to! In order for WebRTC to break through firewalls, there has to be a public service that can carry session information between the users. This means a relay knows what apps you have online and who you've exchanged session details with. Grimwire doesn't currently log that information, but it would be trivial for a host to add the logging themselves.

Should this worry you? It's tempting to compare this information to, say, being seen at a coffee shop by the shop manager. However, the problem with that analogy is that it's imprecise; in fact, the manager also sees you at the other shops, notices every conversation you start, and never forgets anything. That's pretty spooky.

This is why Grimwire's relay doesn't run as one big service - that information is better left unaggregated. Further, under the developing US law, it looks like Web providers can be compelled to install taps or provide backdoors. In large public spaces (like the Web) you might argue for discretionary surveillance along those lines (just as you might in a mall or a park) but if you have a public virtual space then you certainly need discrete private spaces as well. Like any private property, enforcement can be expected to knock on the door with a warrant. The smaller the space, the fewer people are exposed behind that door.

I recommend that families, friends, university groups, businesses, etc - communities with personal, real-world contact - run their own relays, so that users don't have to put their trust in strangers. In the future, Grimwire's relays will be able to inter-communicate, and that will allow you to expand your network without exposing yourself to additional tracking.

#### Tracking by the Applications

By granting access to an application, you give it the ability to see who/what is on the relay and to start new connections. This is less information than the tracker gets - it's more like the app can walk up to the coffee-shop manager (from the previous analogy) and ask what the current situation is. Still, it's a fairly large amount of info, so be mindful of who you authorize.

In a future release, Grimwire will support different levels of authorization that determines what the apps can see and connect to.

#### Tracking by the Network (ISPs and snoops)

Grimwire uses Transport Layer Security, which means it encrypts the data that passes over the wire. However, a determined snoop could log all of the encrypted data and attempt to crack the encryption in the future. This situation is generally uncommon, but still fairly feasible. As a result, you should be aware of which "wires" your programs use:

 - If you're connecting over the Internet, you should assume any number of snoops are logging it.
 - If you're connecting over a LAN, you're probably only logged by the LAN owner (the business, the uni, your home, etc). This is fairly ideal; I doubt your LAN-owner can crack TLS.
 - If you're connecting between tabs on your machine - and WebRTC is working, so bouncing is not in use - the data never leaves your machine. Flawless victory!


## Administration (Running a Relay)

### Configuring the Relay Service

The `grimwire` command requires one of the following parameters:

 - `grimwire setup`: creates the config.json, welcome.html, and motd.html files if they do not exist.

 - `grimwire start`: starts the server.

 - `grimwire reload`: sends a "reload configuration" signal to the server process. Use this when you change config.json, welcome.html, or motd.html, and you don't want to close the server. (Note that closing the server destroys everybody's sessions, forcing them to log back in.)

 - `grimwire stop`: sends a "shutdown" signal to the server process.

Grimwire's configuration can be controlled with either command-line flags on the start command, or with the config.json file. The CLI flags always take precedence over config.json's values. The flags are:

 - `-p/--port`: the port to bind the server to (default 80).
 - `-h/--hostname`: the hostname the relay uses when linking to itself (defaults to system value).
 - `-u/--is_upstream`: if grimwire is upstream of Apache or Nginx, specify this flag with the port Apache/Nginx is using. This is also used for constructing links (default off).
 - `--ssl`: enables TLS, and will look for `ssl-key.pem` and `ssl-cert.pem` in grimwire's directory to set the key & cert (default off).
 - `--allow_signup`: if set to 0, will remove the new-user signup interface from the login page (default 1).

The config.json file can include any of the long versions of those flags. Note that reloading the config does not change the port or SSL status - you must restart the server process to do that.

#### Standard Config with No SSL

In this case, your config.json might look this this:

```
{
	"port": 80,
	"is_upstream": false,
	"ssl": false
}
```

#### Standard Config with SSL

In this case, your config.json might look this this:

```
{
	"port": 443,
	"is_upstream": false,
	"ssl": true
}
```

#### Standard Config with a Front Proxy like Nginx or Apache

In this case, your config.json might look this this:

```
{
	"port": 8000,
	"is_upstream": 443,
	"ssl": false
}
```

### Setting the Welcome Message and Dashboard MOTD

You can change the HTML on the right of the login interface by editing welcome.html. You can change the HTML on the right of the dashboard by editing motd.html. Grimwire's relay uses bootstrap 3 styles.

### Adding, Editing, and Removing Users

Users are stored as extensionless JSON files in the './users' directory under grimwire. For instance, the userfile for 'bob' would be found at 'grimwires_install_directory/users/bob'. His file should look something like this:

```
{
    "id": "bob",
    "email": "bob@bobberson.com",
    "password": "$2a$10$8RJaSIdDMvix4PRbF2F5vut4kDKyqvQX0w/59YCrL4sk0zMaULtZ2",
    "avatar": "user.png",
    "created_at": "2013-10-21T23:28:28.077Z"
}
```

You can add new users by creating files which follow this format, or edit a user's details by editing the file. Likewise, you can remove a user by deleting their userfile. Any changes you make, however, won't make their way into the relay process until you reload (`grimwire reload`) or restart it.

If you want to change a user's password, you can set it as plaintext in the JSON. When the userfile is loaded, Grimwire will encrypt the password and rewrite the file.