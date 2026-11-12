/* Sign-in providers registry (v20261112c). One account, many ways in: email (+ password) and any of these.
   A provider is HIDDEN everywhere (buttons, Account page, legal text blocks) until its keys AND its <P>_LOGIN=true flag are set.
   Add a provider: one file here exporting { id, label, givesEmail, configured, loginEnabled, intents, authorizeUrl, exchange,
   profile, revoke }, add it below, add its id to user_identities' CHECK (migration), its button icon in assets/oauth.js. */
'use strict';
const PROVIDERS = {
  tiktok: require('./tiktok'),
  google: require('./google'),
  facebook: require('./facebook'),
  instagram: require('./instagram'),
};
const get = (id) => (Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? PROVIDERS[id] : null);
const enabledIds = () => Object.keys(PROVIDERS).filter((id) => PROVIDERS[id].loginEnabled());
const publicList = () => enabledIds().map((id) => ({ id, label: PROVIDERS[id].label }));
module.exports = { PROVIDERS, get, enabledIds, publicList };
