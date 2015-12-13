![Demo GIF](https://cloud.githubusercontent.com/assets/1755886/11715310/ccc7080e-9f38-11e5-834e-4937e89801f6.gif)

## A web-based, 'really' real-time collaborative drawing tool.

[sketch.openingdesign.com](http://sketch.openingdesign.com/)

Use
----
- The canvas can be scaled using either the mouse wheel, or by a two-finger pinch gesture
- The canvas can be panned by using either middle-click and drag (only on Chrome), CTRL + left-click and drag, or a two-finger drag
- To create a named canvas goto <url>/d/<name>, eg http://0.0.0.0:9002/d/coolstuff

Installation
------------
  1. Install Requirements. ``sudo apt-get update && sudo apt-get install libcairo2-dev libjpeg8-dev libpango1.0-dev libgif-dev build-essential g++``
  2. Install EtherDraw `` git clone git://github.com/JohnMcLear/draw.git ``
  3. Enter the EtherDraw folder `` cd draw ``
  4. Run EtherDraw `` bin/run.sh `` 
  5. Make a drawing!  Open your browser and visit `` http://127.0.0.1:9002 ``

Requirements
------------
 * [NodeJS] (http://nodejs.org/)
 * Lib Cairo
 * Lib Jpeg
 * Lib Gif

License
-------
Apache 2 License
