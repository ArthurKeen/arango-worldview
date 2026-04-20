
Map the World by Bilawal Sidhu

https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator

Discover more from Map the World by Bilawal Sidhu
Mapping the Frontier of Creation & Computing | TED Curator & Host | A16z Scout | Creator w/ 1.6M+ Subs & 500M+ Views | Ex-Google PM, AR/VR & 3D Maps
Over 23,000 subscribers
Enter your email...
By subscribing, you agree Substack's Terms of Use, and acknowledge its Information Collection Notice and Privacy Policy.
Already have an account? Sign in
I Built a Spy Satellite Simulator in a Browser. Here's What I Learned.
How a weekend project got the attention of Palantir's co-founder.
Bilawal Sidhu
Feb 24, 2026

I posted a demo video last week and went to sleep.

By the time I woke up, the Palantir co-founder had replied to defend his company.

That wasn’t what I was expecting. But it’s also exactly the kind of thing that happens when you accidentally poke a nerve — and it told me more about what I’d built than any of the positive replies did.

Here’s what WorldView does: it lets you look at any place on Earth through the eyes of an intelligence analyst. Night vision. FLIR thermal. CRT scan lines. Live air traffic. Real satellite orbits. And — the part that really starts feeling surreal — actual CCTV camera feeds draped directly onto the 3D model of the city.

All of it running in a browser. No classified clearances.

Just open a tab





If you want to see WorldView in action, you can check out my full walkthrough on YouTube:


What’s actually happening under the hood
The foundation is Google’s Photorealistic 3D Tiles — the same technology that powers Google Earth’s volumetric city models. I spent six years at Google as the PM who helped build this. We were turning the physical world into a navigable 3D map at global scale. Millions of images. Petabytes of photogrammetry. Entire cities reconstructed from aerial photography.

That technology is now publicly accessible via an API.

On top of that, I layered real-time data feeds:

OpenSky Network — 7,000+ live aircraft positions, updated constantly

ADS-B Exchange — crowdsourced military flight tracking.

CelesTrak TLE data — 180+ satellites in actual orbital paths, tracked in real time. Click any one and follow its orbit.

OpenStreetMap — vehicle flow on city streets, rendered as a particle system

Public CCTV cameras — real traffic camera feeds from Austin, geographically located and projected onto the 3D model

And then the shaders. CRT scan lines, night vision (NVG), FLIR thermal, anime cel-shading. Built from studying actual military display specifications — not for the aesthetics, but because those display systems were engineered to extract maximum information from sensor data. Turns out they also look absolutely wild layered over London.

The anime mode is the one nobody expected. Same volumetric city model, same data feeds, same satellite tracking — but rendered with cel-shading that looks like a Studio Ghibli film. The contrast between military surveillance infrastructure and anime aesthetics is jarring in a way that makes you reconsider what “the aesthetic” actually communicates. Switch from anime to FLIR on the same view and the mood shifts from wonder to menace in a frame.

You can stand over Austin at 3 AM in night vision mode and watch a plane descend into the airport. Switch to FLIR and look at Tower Bridge in London through the thermal spectrum, military targeting reticle and all. Pull back to globe view and click on any satellite to start tracking its orbital path in real time.

At some point, it stops feeling like a demo.

Man, it starts feeling magical.

That’s what I said during the recording session. I meant it.





Map the World by Bilawal Sidhu is a reader-supported publication. To receive new posts and support my work, consider becoming a free or paid subscriber.

Type your email...
Subscribe
How I actually built this
Between Gemini 3.1, Claude 4.6, and Codex 5.3 — it’s honestly wild what you can build right now.

I didn’t write this code by hand. I described features in voice notes and screenshots, threw them at multiple AI agents running simultaneously, and steered the results. Running sometimes 8 agents at once, each working on a different subsystem. One’s building the satellite tracker, another’s wiring up the CCTV feeds, a third is implementing the shader pipeline.

I don’t touch even Cursor anymore. I’m going straight into the terminal with each agent open in its own window.

When I worked on Google Maps, it took developers months to get an understanding of how to use the geospatial APIs. This was a weekend. One person, a browser, and a few AI models doing the heavy lifting.




Why I built this
I’ve been saying “spatial intelligence” for a while now. In strategy docs, in tweets, in conversations about what I think matters next after language models. But it’s been mostly words.

WorldView is the first attempt to make the thesis visible.

The thesis: we’re building AI that understands the physical world the way it understands text. Not images — space. Not object recognition — spatial relationships, change over time, movement through a scene, the difference between “a car” and “that car, at that intersection, at that speed, at that hour.”

That’s spatial intelligence. And it changes everything about security, logistics, city planning, disaster response, autonomous systems — basically anything that cares about the real world as it actually exists.

WorldView doesn’t have the intelligence layer yet. But it has the view. It has the data fusion. It has the interface that makes you feel, viscerally, what becomes possible when the physical world becomes queryable and programmable.

I spent six years helping build Google’s version of this infrastructure. I’ve been thinking about the next version for a long time.

This is the prototype. The tip of the iceberg.




Why the Palantir founder responded
There’s a moment in the WorldView demo where I switch on what I was calling “God mode.”

Detection overlays. Every vehicle on the street highlighted. Military flights circling overhead with callsigns and altitude data. Satellites in orbit. CCTV feeds projected onto buildings. Panoptic view — the term comes from Jeremy Bentham’s panopticon, the theoretical prison designed so the guard can always see every prisoner, and the prisoners know it, so they behave as if they’re always being watched.

”You can see everything.”

I said it with genuine wonder. Then I sat with it.

Joe Lonsdale replied to the post with:




I get it. From his vantage point, tools like Palantir exist because this capability has always been real — it just wasn’t accessible. The intelligence community has had something like WorldView for decades. The question Palantir answers is: how do you analyze it? How do you act on it? The data was never the moat.

What’s new with WorldView isn’t the capability. It’s the accessibility.

What I built is fundamentally a surveillance aesthetic built on top of public data. Military-grade shaders over open-source feeds. The visual language of classified intelligence systems running in a browser tab, available to anyone with internet access. And the CCTV integration — real camera footage draped onto real buildings, in real time — I actually built that.

There’s a concept I keep coming back to that applies here: the two viellances. Surveillance (the state watching you) versus sousveillance (you watching back). We’ve spent decades arguing about the power asymmetry in one direction — who has the cameras, who owns the data, who gets to watch.

WorldView is sousveillance aesthetics. Same data streams. Same satellite feeds. Same CCTV cameras. But the interface is in your browser, and you control it.

That’s a different power dynamic. I don’t know yet what all the implications are. But Lonsdale responding told me it’s real enough to push back on — and that matters.




Where this goes
WorldView is a demo. SpatialOS is the actual project.

The spatial intelligence stack — the one that builds a continuously updating model of the physical world, ingests sensor data from satellites and cameras and IoT devices, and makes that model queryable by AI agents in real time — that’s what I’m building.

WorldView shows what the view looks like. The thesis is about the intelligence that runs on top of it.

Think of it this way: this demo is to SpatialOS what Google Maps is to Google’s location intelligence infrastructure. The map is the product people interact with. Underneath it — the data pipelines, the model updates, the location APIs that power a thousand other apps — that’s the real infrastructure.

I’m building the infrastructure. The demo just happens to look like something out of a spy thriller.

And apparently that’s enough to get the attention of people who’ve been building the actual thing for twenty years.

I’ll keep writing as it develops.

If this gave you something to think about, share it with fellow reality mappers. The future’s too interesting to navigate alone.

— Bilawal

Share

119 Likes
∙
20 Restacks
Discussion about this post
Write a comment...
Tyler Bliss
7d
Edited

Bilawal, the architecture here is brilliant. You didn’t just build a simulator; you exposed the default aesthetic of an entire industry. Seeing Palantir's co-founder jump in proves you hit the exact nerve of the surveillance vs. sousveillance debate.

Watching you push the boundaries of SpatialOS is incredibly inspiring, but it provoked a massive question for me: Why is the broader tech world so captivated by military tracking and state control?

Inspired by your concept, I fired up Cursor to build the exact inverse: The Environmental Vitality Map.

What if we took your exact tech stack (Google 3D Tiles, WebGPU, real-time APIs) and pointed it inward? Right now, I’m combining EPA and Water Quality Portal data with live weather, thermal imaging, USDA runoff grids, and decentralized air sensors onto 3D city blocks.

In simple terms: it visualizes the invisible. It lets you actually watch how a toxic industrial air plume physically drifts down a specific street, or trace exactly where agricultural chemicals are bleeding into a local water grid in real-time, or how local governments are relying on outdated guidelines to declare toxic water "compliant."

We have seen U.S. cities and entire communities poisoned because the reality of their water or air was buried in bureaucratic red tape. So instead of just rendering a depressing map of pollution, the system acts as a routing engine for action. When it detects a severe anomaly (like a localized grid quietly flowing Haloacetic acids at 422x the health guideline—echoing what happened in Flint, Michigan), it draws a 'Truth Line' to the source and triggers solutions.

The immediate goal is to coordinate with local and federal governments by auto-generating verified epidemiological reports for city councils. But when agencies are underfunded, backlogged, or unable to step in, the map acts as a community safety net. It integrates smart contracts so neighborhoods have the ability to bypass the wait and instantly self-fund independent lab testing or deploy their own local air and water sensors. If solution A fails, we route to solution B.

As you pointed out with the Palantir response, the data was never the moat. The accessibility is.

You built a God Mode for seeing the world. I'm building a God Mode for community healing.

I am documenting the architecture of this build. I would absolutely love to connect with you and any other "reality mappers" who want to direct this caliber of spatial intelligence inward toward community regeneration.

Like you said, the future is too interesting to navigate alone. Let's flip the panopticon inside out.



