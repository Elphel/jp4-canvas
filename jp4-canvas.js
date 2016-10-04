/*
FILE NAME  : jp4-canvas.js
DESCRIPTION: Converts jp4/jp46 files into human perceivable format in html5 canvas.             
VERSION: 1.0
AUTHOR: Oleg K Dzhimiev <oleg@elphel.com>
LICENSE: AGPL, see http://www.gnu.org/licenses/agpl.txt
Copyright (C) 2015 Elphel, Inc.
*/

var jp4name = "test.jp4"

var FLIPV = 0;
var FLIPH = 0;

var COLOR_MODE = 0;
var IS_JP4 = false;
var IS_JP46 = false;

var SATURATION = [0,0,0,0]; //will be set as 1/GAMMA[i] - in fact it's the same for all pixels.

//GRBG
var BayerMosaic = [
  ["Gr","R"],
  ["B" ,"Gb"]
];

$(function(){
  parseURL();
  initCanvas();
});

function parseURL() {
    var parameters=location.href.replace(/\?/ig,"&").split("&");
    for (var i=0;i<parameters.length;i++) parameters[i]=parameters[i].split("=");
    for (var i=1;i<parameters.length;i++) {
        switch (parameters[i][0]) {
            case "file": jp4name = parameters[i][1];break;
        }
    }
}

function initCanvas(){
  var heavyImage = new Image();
  heavyImage.src = jp4name;
  
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

      parseEXIFMakerNote(this);
               
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
        // RGB > YCbCr x SATURATION > RGB
        // Taking SATURATION[0] = 1/GAMMA[0] (green pixel of GR-line)
        saturation(ctx,SATURATION[0]);
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
          oPixels[4*(offset+x)+0] = ((BayerMosaic[y%2][x%2]=="R" )                               )?macroblock[y][x]:0;
          oPixels[4*(offset+x)+1] = ((BayerMosaic[y%2][x%2]=="Gr")||(BayerMosaic[y%2][x%2]=="Gb"))?macroblock[y][x]:0;
          oPixels[4*(offset+x)+2] = ((BayerMosaic[y%2][x%2]=="B" )                               )?macroblock[y][x]:0;
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
      x_l = (x==0)?1:(x-1);
      x_r = (x==(width-1))?(width-2):(x+1);
      y_t = (y==0)?1:(y-1);
      y_b = (y==(height-1))?(height-2):(y+1);
      //Gr
      if (BayerMosaic[y%2][x%2]=="Gr"){
        oPixels[4*(width*y+x)+0]=1/2*(oPixels[4*(width*(y+0)+(x_l))+0]+oPixels[4*(width*(y+0)+(x_r))+0]);
        oPixels[4*(width*y+x)+2]=1/2*(oPixels[4*(width*(y_b)+(x+0))+2]+oPixels[4*(width*(y_t)+(x+0))+2]);
      }
      //R
      if (BayerMosaic[y%2][x%2]=="R"){
        oPixels[4*(width*y+x)+1]=1/4*(oPixels[4*(width*(y_t)+(x+0))+1]+oPixels[4*(width*(y+0)+(x_l))+1]+oPixels[4*(width*(y+0)+(x_r))+1]+oPixels[4*(width*(y_b)+(x+0))+1]);
        oPixels[4*(width*y+x)+2]=1/4*(oPixels[4*(width*(y_t)+(x_l))+2]+oPixels[4*(width*(y_t)+(x_r))+2]+oPixels[4*(width*(y_b)+(x_l))+2]+oPixels[4*(width*(y_b)+(x_r))+2]);
      }
      //B
      if (BayerMosaic[y%2][x%2]=="B"){
        oPixels[4*(width*y+x)+0]=1/4*(oPixels[4*(width*(y_t)+(x_l))+0]+oPixels[4*(width*(y_t)+(x_r))+0]+oPixels[4*(width*(y_b)+(x_l))+0]+oPixels[4*(width*(y_b)+(x_r))+0]);
        oPixels[4*(width*y+x)+1]=1/4*(oPixels[4*(width*(y_t)+(x+0))+1]+oPixels[4*(width*(y+0)+(x_l))+1]+oPixels[4*(width*(y+0)+(x_r))+1]+oPixels[4*(width*(y_b)+(x+0))+1]);
      }
      //Gb
      if (BayerMosaic[y%2][x%2]=="Gb"){
        oPixels[4*(width*y+x)+0]=1/2*(oPixels[4*(width*(y_t)+(x+0))+0]+oPixels[4*(width*(y_b)+(x+0))+0]);
        oPixels[4*(width*y+x)+2]=1/2*(oPixels[4*(width*(y+0)+(x_l))+2]+oPixels[4*(width*(y+0)+(x_r))+2]);
      }
    }
  }
  ctx.putImageData(outputImage,0,0);
}

function saturation(ctx,s){
    
  var width = ctx.canvas.width;
  var height = ctx.canvas.height;
  
  var inputImage = ctx.getImageData(0,0,width,height);
  var iPixels = inputImage.data;
  
  var r,g,b;
  var Y,Cb,Cr;
  
  for(var y=0;y<height;y++){
    for(var x=0;x<width;x++){
      r = iPixels[4*(width*y+x)+0];
      g = iPixels[4*(width*y+x)+1];
      b = iPixels[4*(width*y+x)+2];
      
      Y =  0.299*r+0.5870*g+ 0.144*b;
      
      Cb = 128+s*(-0.1687*r-0.3313*g+ 0.500*b);
      Cr = 128+s*(    0.5*r-0.4187*g-0.0813*b);
            
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

function parseEXIFMakerNote(src){
  
  var exif_orientation = EXIF.getTag(src,"Orientation");
  
  console.log("Exif:Orientation: "+exif_orientation);
  
  var MakerNote = EXIF.getTag(src,"MakerNote");
  
  //FLIPH & FLIPV
  if (typeof MakerNote !== 'undefined'){
    FLIPH = (MakerNote[10]   )&0x1;
    FLIPV = (MakerNote[10]>>1)&0x1;
    
    var tmpBayerMosaic = Array();
    for (var i=0;i<BayerMosaic.length;i++){tmpBayerMosaic[i] = BayerMosaic[i].slice();}
    
    if (FLIPV==1){
      for(i=0;i<4;i++){BayerMosaic[(i>>1)][(i%2)] = tmpBayerMosaic[1-(i>>1)][(i%2)];}
      for(i=0;i<BayerMosaic.length;i++){tmpBayerMosaic[i] = BayerMosaic[i].slice();}
    }
    if (FLIPH==1){
      for(i=0;i<4;i++){BayerMosaic[(i>>1)][(i%2)] = tmpBayerMosaic[(i>>1)][1-(i%2)];}
    }
  }
  
  console.log("MakerNote: Flips: V:"+FLIPV+" H:"+FLIPH);
  
  //COLOR_MODE ----------------------------------------------------------------
  if (typeof MakerNote !== 'undefined') COLOR_MODE=(MakerNote[10]>>4)&0x0f;    
  switch(COLOR_MODE){
    case 2: IS_JP46 = true; break;
    case 5: IS_JP4  = true; break;
    //default:
  }
  
  //var gains = Array();
  //var blacks = Array();
  var gammas = Array();
  //var gamma_scales = Array();
  //var blacks256 = Array();
  //var rgammas = Array();
  
  
  //SATURATION ----------------------------------------------------------------
  if (typeof MakerNote !== 'undefined'){
    for(i=0;i<4;i++){
      //gains[i]= MakerNote[i]/65536.0;
      //blacks[i]=(MakerNote[i+4]>>24)/256.0;
      gammas[i]=((MakerNote[i+4]>>16)&0xff)/100.0;
      //gamma_scales[i]=MakerNote[i+4] & 0xffff;
    }
    /*
    for (i=0;i<4;i++) {
      rgammas[i]=elphel_gamma_calc(gammas[i], blacks[i], gamma_scales[i]); 
    }
    console.log(rgammas);
    //adjusting gains to have the result picture in the range 0..256
    min_gain=2.0*gains[0];
    for (i=0;i<4;i++){
      if (min_gain > (gains[i]*(1.0-blacks[i]))) min_gain = gains[i]*(1.0-blacks[i]);
    }
    for (i=0;i<4;i++) gains[i]/=min_gain;
    for (i=0;i<4;i++) blacks256[i]=256.0*blacks[i];
    */
    for (i=0;i<4;i++) SATURATION[i] = 1/gammas[i];
    console.log("MakerNote: Saturations: "+SATURATION[0]+" "+SATURATION[1]+" "+SATURATION[2]+" "+SATURATION[3]);
  }
  
}

/*
function elphel_gamma_calc(gamma,black,gamma_scale){

  gtable = Array();
  rgtable = Array();

  black256=black*256.0;
  k=1.0/(256.0-black256);
  if (gamma < 0.13) gamma=0.13;
  if (gamma >10.0)  gamma=10.0;
  
  for (var i=0;i<257;i++) {
    x=k*(i-black256);
    if (x<0.0) x=0.0;
    ig = 0.5+65535.0*Math.pow(x,gamma);
    ig = (ig*gamma_scale)/0x400;
    if (ig>0xffff) ig=0xffff;
    gtable[i]=ig;
  }
  // now gtable[] is the same as was used in the camera
  // FPGA was using linear interpolation between elements of the gamma table, so now we'll reverse that process
  indx=0;
  for (i=0;i<256;i++) {
    outValue=128+(i<<8);
    while ((gtable[indx+1]<outValue) && (indx<256)) indx++;
      if (indx>=256) rgtable[i]=65535.0/256;
      else if (gtable[indx+1]==gtable[indx]) 
        rgtable[i]=i;
      else           
        rgtable[i]=indx+(1.0*(outValue-gtable[indx]))/(gtable[indx+1] - gtable[indx]);
  }
  return rgtable;
}
*/


