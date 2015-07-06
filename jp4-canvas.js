/*
FILE NAME  : jp4-canvas.js
DESCRIPTION: Converts jp4/jp46 files into human perceivable format in html5 canvas.             
VERSION: 1.0
AUTHOR: Oleg K Dzhimiev <oleg@elphel.com>
LICENSE: AGPL, see http://www.gnu.org/licenses/agpl.txt
Copyright (C) 2015 Elphel, Inc.
*/

var COLOR_MODE = 0;
var IS_JP4 = false;
var IS_JP46 = false;

$(function(){
  initCanvas();
});

function initCanvas(){
  var heavyImage = new Image();
  heavyImage.src = "test.jp4";
  
  var canvas = $("<canvas>",{id:"canvas"}).css({
    position: "absolute",
    top: "0px",
    left: "0px"
  });
    
  $("body").append(canvas);
  
  //get metadata then redraw
  $(heavyImage).load(function(){
    EXIF.getData(this, function() {
      //update canvas size
      canvas.attr("width",this.width);
      canvas.attr("height",this.height);

      var MakerNote = EXIF.getTag(this,"MakerNote");
          
      if (typeof MakerNote !== 'undefined') COLOR_MODE=(MakerNote[10]>>4)&0x0f;
          
      switch(COLOR_MODE){
        case 2: IS_JP46 = true; break;
        case 5: IS_JP4  = true; break;
        //default:
      }         
               
      canvas.drawImage({
        x:0, y:0,
        source: heavyImage,
        load: redraw,
        scale: 1,
        fromCenter: false
      });
    });
  });
}

function redraw(){
  $(this).draw({
    fn: function(ctx){
      if (IS_JP4||IS_JP46){
		    pixelBlocksReorder(ctx);
		    demosaic_bilinear(ctx);
		  }  
    }
  });
}

// reorder blocks if needed
function pixelBlocksReorder(ctx){
  
  var width = ctx.canvas.width;
  var height = ctx.canvas.height;
  
  var inputImage = ctx.getImageData(0,0,width,height);
  var iPixels = inputImage.data;

  var outputImage = ctx.createImageData(width,height);
  var oPixels = outputImage.data;

  // img.data is a long 1-D array with the following structure:
  // pix[i+0] - red
  // pix[i+1] - green
  // pix[i+2] - blue
  // pix[i+3] - alpha

  // buffer for reordering pixels
  var macroblock = new Array(); //16x16
  for (var y=0;y<16;y++) macroblock[y]=new Array();

  // in JP4 format the 16x16 block is 32x8 (GRBG)
  // the 1st line of 32x8 blocks is the left half of the image
  // the 2nd line of 32x8 blocks is the right half   

  // vertical step = 16 pixels
  for (yb=0;yb<(height>>4);yb++){
    // horizontal step = 16 pixels 
    for (xb=0;xb<(width>>4);xb++) {
      if (IS_JP4) {
		    // 32x8 block reorder into 16x16
		    for (nb=0;nb<4;nb++) {
	  		  xbyr= nb&1; // horizontal odd-even
          ybyr=(nb>>1)&1; // vertical odd-even
          for (y=0;y<8;y++) {
            // xb <  half image -> 1st line of 32x8
	    		  // xb >= half image -> 2nd line of 32x8
	    		  //offset=(((yb<<4)+y)*width)+(nb<<3)+((xb>=(width>>5))?(((xb<<5)-width)+(width<<3)):(xb<<5));
	    		  offset=(((yb<<4)+y)*width)+(nb<<3)+(xb<<5)+((xb>=(width>>5))?((width<<3)-width):0);
	    		  for (x=0;x<8;x++) {
	      		  macroblock[(y<<1)|ybyr][(x<<1)|xbyr]=iPixels[4*(offset+x)];
	    		  }
	  		  }
		    }
		  }  
		  if (IS_JP46) {
        for (y=0;y<16;y++) {
          offset=((yb<<4)+y)*width+(xb<<4);
          for (x=0;x<16;x++) {
            macroblock[((y<<1)&0xe)|((y>>3)&0x1)][((x<<1)&0xe)|((x>>3)&0x1)]=iPixels[4*(offset+x)];
          }
        }
		  }  
		  
	    /* apply gammas here */
	    // ... or not
	    
	    for (y=0;y<16;y++) {
  		  offset=width*((yb<<4)+y)+(xb<<4);
  		  for (x=0;x<16;x++) {
  			  //red +0, green +1, blue +2, alpha +3
  			  // thinking: GRBG
    		  oPixels[4*(offset+x)+0] = ((x%2==1&&y%2==0)                  )?macroblock[y][x]:0;
    		  oPixels[4*(offset+x)+1] = ((x%2==0&&y%2==0)||(x%2==1&&y%2==1))?macroblock[y][x]:0;
    		  oPixels[4*(offset+x)+2] = ((x%2==0&&y%2==1)                  )?macroblock[y][x]:0;
    		  oPixels[4*(offset+x)+3] = 255; 
  		  }
	    }
    }
  }
  ctx.putImageData(outputImage,0,0);
}

// demosaic GRBG array - bilinear
function demosaic_bilinear(ctx){
  
  var width = ctx.canvas.width;
  var height = ctx.canvas.height;
  
  var outputImage = ctx.getImageData(0,0,width,height);
  var oPixels = outputImage.data; 
  
  for(var y=0;y<height;y++){
    for(var x=0;x<width;x++){
      //Gr
      if (x%2==0&&y%2==0){
        oPixels[4*(width*y+x)+0]=1/2*(oPixels[4*(width*(y+0)+(x-1))+0]+oPixels[4*(width*(y+0)+(x+1))+0]);
        oPixels[4*(width*y+x)+2]=1/2*(oPixels[4*(width*(y-1)+(x+0))+2]+oPixels[4*(width*(y+1)+(x+0))+2]);
      }
      //R
      if (x%2==1&&y%2==0){
        oPixels[4*(width*y+x)+1]=1/4*(oPixels[4*(width*(y-1)+(x+0))+1]+oPixels[4*(width*(y+0)+(x-1))+1]+oPixels[4*(width*(y+0)+(x+1))+1]+oPixels[4*(width*(y+1)+(x+0))+1]);
        oPixels[4*(width*y+x)+2]=1/4*(oPixels[4*(width*(y-1)+(x-1))+2]+oPixels[4*(width*(y-1)+(x+1))+2]+oPixels[4*(width*(y+1)+(x-1))+2]+oPixels[4*(width*(y+1)+(x+1))+2]);
      }
      //B
      if (x%2==0&&y%2==1){
        oPixels[4*(width*y+x)+0]=1/4*(oPixels[4*(width*(y-1)+(x-1))+0]+oPixels[4*(width*(y-1)+(x+1))+0]+oPixels[4*(width*(y+1)+(x-1))+0]+oPixels[4*(width*(y+1)+(x+1))+0]);
        oPixels[4*(width*y+x)+1]=1/4*(oPixels[4*(width*(y-1)+(x+0))+1]+oPixels[4*(width*(y+0)+(x-1))+1]+oPixels[4*(width*(y+0)+(x+1))+1]+oPixels[4*(width*(y+1)+(x+0))+1]);
      }
      //Gb
      if (x%2==1&&y%2==1){
        oPixels[4*(width*y+x)+0]=1/2*(oPixels[4*(width*(y-1)+(x+0))+0]+oPixels[4*(width*(y+1)+(x+0))+0]);
        oPixels[4*(width*y+x)+2]=1/2*(oPixels[4*(width*(y+0)+(x-1))+2]+oPixels[4*(width*(y+0)+(x+1))+2]);
      }
    }
  }
  ctx.putImageData(outputImage,0,0);
}