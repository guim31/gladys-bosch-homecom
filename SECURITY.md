# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes, in
particular:

- the sign-in: the PKCE verifier of the login in progress, the code pasted in
  the configuration (exchanged once, never logged) and the SingleKey ID
  **refresh token**, the only lasting secret, kept in
  `/data/bosch-homecom.json` (mode 600) and rotated at every use. The access
  token lives in memory only;
- what else `/data/bosch-homecom.json` holds: the appliances seen last
  (gateway ids, which are the appliance serial numbers) and the fault codes
  already reported;
- the network: HTTPS to `singlekey-id.com` and
  `pointt-api.bosch-thermotechnology.com` only; no port is opened, nothing is
  listened to;
- the logs: no password, token, code or verifier at any level.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Bosch services and appliances the integration talks to (report those to
Bosch), and the SingleKey ID account itself.
