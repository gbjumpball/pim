# pim

Materials developed for Personal Injury Media.

## Consumer journey slide

A six stage consumer legal journey diagram, grouped into awareness, consideration
and conversion phases, with the media channels active at each stage.

Playback is chaptered for presenting. The opening sequence plays automatically and
then holds. Each click, or the space bar, reveals one stage. A pill in the corner
names what the next click will show.

| File | Purpose |
| --- | --- |
| `preview.html` | Self contained build. Fonts and React are embedded, so it runs offline with no server. Served at the site root. |
| `journey-animation-pim.jsx` | The animation component. |
| `Consumer Journey PIM.dc.html` | Claude Design slide shell that hosts the component. |
| `Consumer Journey PIM.html` | Reference export from Claude Design. |

### Presenting

Open the site, scroll so the map fills the window, then click it once to start and
to give it keyboard focus. The space bar and right arrow advance a stage after that.
Share the browser tab rather than the whole screen on video calls.
