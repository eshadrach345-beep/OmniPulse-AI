# Connecting social accounts with PostPeer

OmniPulse uses PostPeer (postpeer.dev) so you do not need a developer app and review for every network.

## Set up
1. In PostPeer open the Dashboard and copy your access key.
2. In Vercel open Settings, Environment Variables and add `POSTPEER_API_KEY` with that key. Never put the key in code or in a chat.
3. Redeploy.
4. Open Account settings, System check. The PostPeer line should say the key is accepted.

## How it works
- Each customer gets their own PostPeer "profile". Clicking Connect opens the network's own sign-in page through PostPeer.
- When they finish, OmniPulse copies the connected account into the accounts bar by itself.
- Publishing now and scheduling for later both go through PostPeer. PostPeer holds scheduled posts, so you do not need the cron job.
- PostPeer gives 20 free credits. Check its Credit Usage page to see what a post costs, and set your plan prices with that in mind.

## Good to know
- Posts with video need a public video link. Productions made of several scenes must be joined first, so publishing them is not built yet. Single clips publish fine.
- If you shared the key anywhere, create a new one in the PostPeer dashboard and replace it in Vercel.
