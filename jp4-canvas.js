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

//GRBG
var bayerMosaic = [
  "Gr","R",
  "B" ,"Gb"
];

var SATURATION=2.0;

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
        //convert to YCbCr to apply some saturation
        saturation(ctx);
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

      for (y=0;y<16;y++) {
        offset=width*((yb<<4)+y)+(xb<<4);
        for (x=0;x<16;x++) {
          //red +0, green +1, blue +2, alpha +3
          // thinking: GRBG
          bi = 2*(y%2)+x%2;
          oPixels[4*(offset+x)+0] = ((bayerMosaic[bi]=="R" )                         )?macroblock[y][x]:0;
          oPixels[4*(offset+x)+1] = ((bayerMosaic[bi]=="Gr")||(bayerMosaic[bi]=="Gb"))?macroblock[y][x]:0;
          oPixels[4*(offset+x)+2] = ((bayerMosaic[bi]=="B" )                         )?macroblock[y][x]:0;
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
  
  var x_l = 0, x_r = 0;
  var y_t = 0, y_b = 0;
  
  for(var y=0;y<height;y++){
    for(var x=0;x<width;x++){
      bi = 2*(y%2)+x%2;
      x_l = (x==0)?1:(x-1);
      x_r = (x==(width-1))?(width-2):(x+1);
      y_t = (y==0)?1:(y-1);
      y_b = (y==(height-1))?(height-2):(y+1);
      //Gr
      if (bayerMosaic[bi]=="Gr"){
        oPixels[4*(width*y+x)+0]=1/2*(oPixels[4*(width*(y+0)+(x_l))+0]+oPixels[4*(width*(y+0)+(x_r))+0]);
        oPixels[4*(width*y+x)+2]=1/2*(oPixels[4*(width*(y_b)+(x+0))+2]+oPixels[4*(width*(y_t)+(x+0))+2]);
      }
      //R
      if (bayerMosaic[bi]=="R"){
        oPixels[4*(width*y+x)+1]=1/4*(oPixels[4*(width*(y_t)+(x+0))+1]+oPixels[4*(width*(y+0)+(x_l))+1]+oPixels[4*(width*(y+0)+(x_r))+1]+oPixels[4*(width*(y_b)+(x+0))+1]);
        oPixels[4*(width*y+x)+2]=1/4*(oPixels[4*(width*(y_t)+(x_l))+2]+oPixels[4*(width*(y_t)+(x_r))+2]+oPixels[4*(width*(y_b)+(x_l))+2]+oPixels[4*(width*(y_b)+(x_r))+2]);
      }
      //B
      if (bayerMosaic[bi]=="B"){
        oPixels[4*(width*y+x)+0]=1/4*(oPixels[4*(width*(y_t)+(x_l))+0]+oPixels[4*(width*(y_t)+(x_r))+0]+oPixels[4*(width*(y_b)+(x_l))+0]+oPixels[4*(width*(y_b)+(x_r))+0]);
        oPixels[4*(width*y+x)+1]=1/4*(oPixels[4*(width*(y_t)+(x+0))+1]+oPixels[4*(width*(y+0)+(x_l))+1]+oPixels[4*(width*(y+0)+(x_r))+1]+oPixels[4*(width*(y_b)+(x+0))+1]);
      }
      //Gb
      if (bayerMosaic[bi]=="Gb"){
        oPixels[4*(width*y+x)+0]=1/2*(oPixels[4*(width*(y_t)+(x+0))+0]+oPixels[4*(width*(y_b)+(x+0))+0]);
        oPixels[4*(width*y+x)+2]=1/2*(oPixels[4*(width*(y+0)+(x_l))+2]+oPixels[4*(width*(y+0)+(x_r))+2]);
      }
    }
  }
  ctx.putImageData(outputImage,0,0);
}

function saturation(ctx){
    
  var width = ctx.canvas.width;
  var height = ctx.canvas.height;
  
  var inputImage = ctx.getImageData(0,0,width,height);
  var iPixels = inputImage.data;
  
  var r,g,b;
  var Y,Cb,Cr;
  
  for(var y=0;y<height;y++){
    for(var x=0;x<width;x++){
      //don't forget to multiply?
      r = iPixels[4*(width*y+x)+0];
      g = iPixels[4*(width*y+x)+1];
      b = iPixels[4*(width*y+x)+2];
      
      Y =       0.299*r+0.5870*g+ 0.144*b;
      Cb = 128+SATURATION*(-0.1687*r-0.3313*g+ 0.500*b);
      Cr = 128+SATURATION*(    0.5*r-0.4187*g-0.0813*b);
            
      if (Cb<0) Cb=0; if (Cb>255) Cb=255;
      if (Cr<0) Cr=0; if (Cr>255) Cr=255;
      
      r = Y + 1.402*(Cr-128);
      g = Y - 0.34414*(Cb-128)-0.71414*(Cr-128);
      b = Y + 1.772*(Cb-128);
      
      if (r<0) r=0; if (r>255) r=255;
      if (g<0) g=0; if (g>255) g=255;
      if (b<0) b=0; if (b>255) b=255;
      
      iPixels[4*(width*y+x)+0]=r;
      iPixels[4*(width*y+x)+1]=g;
      iPixels[4*(width*y+x)+2]=b;
      iPixels[4*(width*y+x)+3]=255;
    }
  }
  ctx.putImageData(inputImage,0,0);
}
