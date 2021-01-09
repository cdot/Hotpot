A couple of scripts that may be useful. I used to use both of them, but
don't any more, so they are just kept here for reference. They should be
regarded as untested.

# GetIP

If you enjoy the benefit of a fixed public IP address, you don't need
 this script.

On the other hand, if your hotpot server sits on an internal network behind
an ADSL router that has a DHCP-allocated IP address that changes whenever
the router reboots, you might.

The ADSL router can redirect requests to the hotpot server, but order to reach
it the router from the internet, you have to know its current public IP
address. This script helps you find it, and upload that information to
a known internet host using FTP. The assumption is that the known host will
publish an HTML page containing an HTML redirect to the home server,
though GetIP should also work for a 30x redirect.

The pattern employed by GetIP is:
* Find out the IP address by poking various sources, local router
  first and then various 3rd party sites
* Download the existing redirect, and if the address therein (if found) is
  unchanged, stop.
* Load and fill a template for the redirect file
* Use FTP to upload the completed template to the known host.

The existing IP address is determined by running through a sequence
of different ways to get the IP address; by looking at a local router,
then by reflection off an external website.

## Configuration

Configuration is read from a file, default `./GetIP.config`
Example configuration:
```
{
  template: "GetIP_template.html",
  ftp: { // Details required to upload the redirect HTML
    debugEnable: false,
    host: "ftp.isp.net",
    user: "example",
    pass: "password",
    path: "/htdocs/hotpot.html"
 },
  http: { // Address of the redirect HTML once it is uploaded
    host: "example.co.uk",
    port: "80",
    path: "/hotpot.html"
  },
  target: { // Details of the redirect target that are independent
            // of the IP address
    protocol: "https",
    port: 13196,
    path: "/blah.html"
  }
  netgear_router: { // if you have a netear router, how to scrape it
    url: "http://admin:password@192.168.1.1/RST_status.htm",
    logout_url: "http://192.168.1.1/LGO_logout.htm"
  },
  gateway_router: { // if you have a gateway router, how to scrape it
    // See code
  }
}
```
# Template

The template is read from an external file defined by the config, and
may include the following tokens:
* `#protocol` - expands to the protocol, https/https (no :)
* `#ipaddr` - expands to the DHCP'd ipaddress
* `#port` - expands to the port e.g. `:8080`
* `#path` - expands to the path e.g. `/blah.html`

`protocol`, `port` and `path` all come from the config file. `ipaddr` comes
from whatever GetIP determines is the public IP address of the server.

The template may also include `<!--GetIP...-->` where ... is a JSON
structure containing the redirect target e.g
```
<!--GetIP {
 "protocol": "https",
 "ipaddr": "51.9.106.58",
 "port": ":13196",
 "path": "/browser.html"
}
```

# GetTime

A stand-along Raspberry Pi depends on it's CMOS clock for the time. While
the drift of this clock is minimal, it does need to be set correctly on
boot. This could be done using an NTP server, but your Pi may have been
on a serious diet and not have one. This little script simply
pings a reliable site on the web and gets the time from the
headers in the response, and set the local time using the `date` shell command.

Must be run as admin to set the time. You may want to run it in a cron job
to correct drift.

## Configuration

Configuration is simply a list of sites to try, and is read from a file,
default `./GetTime.cfg`

Example configuration:
```
["http://gov.uk","http://ntp.org"]
```
