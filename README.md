# JP4/JP46 on canvas
## Description
A template<br/>
Convert JP4/JP46 image files (\*.jp4/\*.jp46) into human perceivable format.<br/>
This includes reordering within JPEG blocks and demosaicing (bilinear interpolation).<br/>
Files in JPEG format are left untouched.<br/>
Operations:
* Read EXIF MakerNote field: color mode, flips, gammas.
* Reorder Bayer Mosaic according to flips - initial mosaic=GRBG
* (if JP4/JP46) Reorder pixels back from 8x32 blocks to 16x16 macroblocks
* Demosaic (bilinear)
* RGB > YCbCr > Apply Saturation (=1/Gamma) > RGB

## Usage
Replace <i>test.jp4</i>

## Used libraries
* [jQuery](http://jquery.com) 
* [jCanvas](http://calebevans.me/projects/jcanvas/)
* [Exif-js](https://github.com/exif-js/exif-js)

## EXIF
In Elphel cameras extra information is added to the EXIF header's
<i>MakerNote</i> field:
> COLOR_MODE = (MakerNote[10]>>4) & 0x0f;<br/>
> FLIPH      = (MakerNote[10]   ) & 0x1;<br/>
> FLIPV      = (MakerNote[10]>>1) & 0x1;

## More info:
* [About JP4](http://wiki.elphel.com/index.php?title=JP4)
* [Extra info in EXIF <i>MakerNote</i>](http://wiki.elphel.com/index.php?title=Exif)
* Java code reference for JP4 deblocking and EXIF's <i>MakerNote</i>: [ImageJ-Elphel (JP46_Reader_camera.java)](https://github.com/Elphel/imagej-elphel/blob/master/src/main/java/JP46_Reader_camera.java)
