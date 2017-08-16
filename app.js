/**********
* お絵かきシステム by kimtm 2017 MIT License
*/
//{
"use strict";


/**
 * 設定
 */
const SKYWAY_API_KEY = "d5103838-5286-444c-943c-0f5645726712";  // SkyWayのAPIkey
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const BACKGROUND_TRANSPARENCE = false;  // 背景が透明: true, 背景が白: false
const BACKGROUND_COLOR = "white";  // 背景色(BACKGROUND_TRANSPARENCEが優先される)

/* シグナリングサーバと接続 */
let multiparty = new MultiParty({
  "key": SKYWAY_API_KEY,
  "room": "live-drawing",
  "reliable": true,
  "video": false,
  "audio": false,
  "turn": true
});

let myPeer = {"id": "", "name": "名無し" };
let peerList = {};


// メインのキャンバス(, コンテキスト)
let canvas;
let ctx;

// ペンのプレビュー(, コンテキスト)
let pcanvas;
let pctx;

// ペンの描画中かどうかのフラグ
let drawFlag = false;

// ペン
let pen = {"mode": "pencil", "width": 10, "color": "black"};

// ペンの位置
let point = {"x": 0, "y": 0, "bx": 0, "by": 0};

// キャンバスが初期化されているかどうか
let canvasInitFlag = false;



/* DOMの解析完了 */
window.addEventListener("DOMContentLoaded", ()=>{
  
  /* キャンバスオブジェクトの取得 */
  // メインのキャンバス
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext('2d');

  // ペンのプレビュー用
  pcanvas = document.getElementById("pencilStyleCanvas");
  pctx = pcanvas.getContext('2d');

  /* キャンバスの大きさを指定 */
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;




  /* 通信のイベントの登録 */
  multiparty.on("open", (myid)=>{
    /* シグナリングサーバとつながったとき */

    // 自分をピアリストに保存
    myPeer.id = myid;
    peerList[myid] = myPeer;
    console.log("サーバと接続しました");
    multiparty.listAllPeers(function(lists){console.log("接続中:", lists);});

  }).on("dc_open", (peerid)=>{
    /* データ通信チャネルが利用可能になったとき */

    // ピアリストに追加
    if(peerList[peerid] === undefined){
      peerList[peerid] = {};
    }

    // キャンバスが初期化されていない場合は，他人のキャンバスを要求
    if(!canvasInitFlag){
      multiparty.send(JSON.stringify({"type": "paint", "ope": "requestCanvasData"}));
    }
    

  }).on("message", (msg)=>{
    /* メッセージ受信時 */

    // メッセージ本体をパース
    let msgObj = JSON.parse(msg.data);
    console.log(msgObj);
    // メッセージのタイプによって分岐
    switch(msgObj.type){
      
      // お絵かきのコマンドの場合
      case "paint":
        // {"type": "paint", "ope": "drawLine", "pen": pen, "point": point}
        

        // さらに操作によって分岐
        switch(msgObj.ope){
          // 線を引く
          case "drawLine":
            // {"type": "paint", "ope": "drawLine", "pen": pen, "point": point}
            drawLine(msgObj.pen, msgObj.point);
            break;

          //点を打つ
          case "drawDot":
            // {"type": "paint", "ope": "drawDot", "pen": pen, "x": x, "y": y}
            drawLine(msgObj.pen, msgObj.x, msgObj.y);
            break;

          // キャンバスをクリアする
          case "clearCanvas":
            clearCanvas();
            break;

          // キャンバスのデータを要求されたので，送る
          case "requestCanvasData":
            multiparty.send(JSON.stringify({
              "type": "paint", 
              "ope": "updateCanvasData", 
              "canvas": canvas.toDataURL()
            }));
            break;
          
          // キャンバスのデータを受信
          case "updateCanvasData":
            // まだキャンバスが初期化されていない場合
            if(!canvasInitFlag){
              // イメージオブジェクトの生成
              let defaultImg = new Image(CANVAS_WIDTH, CANVAS_HEIGHT);
              defaultImg.src = msgObj.canvas;
              setTimeout(()=>{
                ctx.drawImage(defaultImg, 0, 0);
                canvasInitFlag = true;
                console.log("inited canvas");
              }, 50);
            }
            break;
        }
        break;
        // お絵かきコマンドの場合終了
    }

  }).on("error", (error)=>{
    switch(error.type){
      case "PermissionDeniedError":
        alert("メディアアクセスを許可してください");
        //https://developer.mozilla.org/ja/docs/Web/API/MediaDevices/getUserMedia
        break;
      case "browser-incompatible":
        alert("WebRTC対応ブラウザでアクセスしてください");
        break;
      default:
        console.error(error);
        alert("しばらく時間をおいて再度試してみてください．(別ウィンドウで開くとうまくいくかも)");
    }
  });

  /* マウスを動かしたとき(描画する) */
  canvas.addEventListener("mousemove", (e)=>{
    if(drawFlag){
      
      // マウス位置の取得(canvas内の相対座標)
      let rect = e.target.getBoundingClientRect();
      point.x = e.clientX - rect.left;
      point.y = e.clientY - rect.top;

      // 線の描画
      drawLine(pen, point);

      // 描画を全員へ共有
      multiparty.send(JSON.stringify({"type": "paint", "ope": "drawLine", "pen": pen, "point": point}));

      // 位置履歴の更新
      point.bx = point.x;
      point.by = point.y;
    }
  });

  canvas.addEventListener("mousedown", (e)=>{
    // クリック位置の取得
    let rect = e.target.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    switch(pen.mode){
      case "pencil":
      case "eraser":
        drawFlag = true;
        // 位置の初期化
        point.bx = x;
        point.by = y;
        break;
      case "color-picker":
        const data = ctx.getImageData(x, y, 1, 1).data;
        pen.color = "rgba(" + data[0] + "," + data[1] + "," + data[2] + "," + (data[3] / 255) + ")";
        updatePencilStyleCanvas();
        pen.mode = "pencil";
        break;
    }
    
  });

  canvas.addEventListener("mouseup", (e)=>{
    drawFlag = false;
    // 動かさずにマウスを離したとき
    if((point.bx !== point.x) && (point.by !== point.y)){
      // マウス位置の取得(canvas内の相対座標)
      let rect = e.target.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;

      // 点の描画
      drawDot(pen, x, y);
      multiparty.send(JSON.stringify({"type": "paint", "ope": "drawDot", "pen": pen, "x": x, "y": y}));
    }
  });


  /* キャンバスのクリア */
  document.getElementById("clearCanvasBtn").addEventListener("click", function(){
    clearCanvas();
    multiparty.send(JSON.stringify({"type": "paint", "ope": "clearCanvas"}));
  });

  /* 鉛筆モード */
  document.getElementById("pencilBtn").addEventListener("click", function(){
    pen.mode = "pencil";
  });

  /* 消しゴムモード */
  document.getElementById("eraserBtn").addEventListener("click", function(){
    pen.mode = "eraser";
  });

  /* カラーピッカーモード */
  document.getElementById("colorPickerBtn").addEventListener("click", function(){
    pen.mode = "color-picker";
  });
  
  /* 色の変更 */
  document.getElementById("colorPalette").addEventListener("change", function(){
    pen.color = this.value;
    updatePencilStyleCanvas();
  });

  /* 太さの変更 */
  document.getElementById("thicknessRanger").addEventListener("input", function(){
    pen.width = this.value;
    document.getElementById("thicknessMeter").textContent = pen.width;
    updatePencilStyleCanvas();
  });

  /* 画像のダウンロード */
  document.getElementById("downloadLink").addEventListener("click", function(ev){
    this.href = canvas.toDataURL();
    this.download = "image";
  }, false);

  /* コントロールボタン */
  let penBtns = document.getElementsByClassName("pen-btn");
  for(let elm of penBtns){
    elm.addEventListener("click", function(){
      let clickedElm = this;
      for(let elme of document.getElementsByClassName("pen-btn active")){
        elme.classList.remove("active");
      }
      clickedElm.classList.add("active");
    }, false);
  }

  /* 線を引く */
  function drawLine(pen, point){  
    setColor();
    ctx.lineWidth = pen.width;   // 線の太さ
    ctx.lineCap = "round";  // 線の終端
    ctx.beginPath();
    ctx.moveTo(point.bx, point.by);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.closePath();
  }

  /* 点を打つ */
  function drawDot(pen, x, y){
    setColor();
    ctx.beginPath();
    ctx.arc(x, y, pen.width/2, 0, Math.PI*2, false);
    ctx.fill();
    
  }

  /* 塗りつぶし */
  function fill(pen, x, y){
    let buffer = canvas.imageData.data;
    // あとで実装
  }

  /* キャンバスをクリア */
  function clearCanvas(){
    // 背景を透明にするかどうかで分岐
    if(BACKGROUND_TRANSPARENCE){
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }else{
      ctx.fillStyle = BACKGROUND_COLOR;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }

  /* 鉛筆のスタイル見本を更新 */
  function updatePencilStyleCanvas(){
    // 
    const thickness = pen.width;
    pctx.clearRect(0, 0, pcanvas.width, pcanvas.height);
    pctx.fillStyle = pen.color;
    pctx.beginPath();
    pctx.arc(pcanvas.width/2, pcanvas.height/2, thickness/2, 0, Math.PI*2, false);
    pctx.fill();
  }

  /* 消しゴムか判断して色を指定 */
  function setColor(){
    switch(pen.mode){
      case "pencil":
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = pen.color;  // 色を指定
        break;

      case "eraser":
        if(BACKGROUND_TRANSPARENCE){
          // 透明に
          ctx.globalCompositeOperation = "destination-out";
        }else{
          // 白で塗りつぶし
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = BACKGROUND_COLOR;
        }
        break;
    }
  }



  updatePencilStyleCanvas();
  clearCanvas();
  multiparty.start();
});







//}