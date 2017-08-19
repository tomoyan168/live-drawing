/*##########################################
# Live Drawing (c) kimtm 2017 MIT License
##########################################*/



/*******************************************
*  各種設定
********************************************/

// SkyWayのAPIkey
const SKYWAY_API_KEY = "b4b40ddc-34ef-4621-aed9-2d53c3e8f777";

// キャンバスの大きさ
const CANVAS_WIDTH = 850;
const CANVAS_HEIGHT = 750;

// キャンバスの背景の透過(背景が透明: true, 背景が色: false)
const BACKGROUND_TRANSPARENCE = false;

// キャンバスの背景色(BACKGROUND_TRANSPARENCEが優先される)
const BACKGROUND_COLOR = "#ffffff";


/*******************************************
*  共有オブジェクト
********************************************/
let multiparty;
let myPeer = { "id": "", "name": "名無し" };
let peers = {};

// メインのキャンバス(, コンテキスト)
let canvas;
let ctx;

// ペンのプレビュー用キャンバス(, コンテキスト)
let pcanvas;
let pctx;

// ペンの描画中かどうかのフラグ
let drawFlag = false;

// ペン
let pen = { "mode": "pencil", "width": 10, "color": "#000000" };

// ペンの位置
let point = { "x": 0, "y": 0, "bx": 0, "by": 0 };

// キャンバスが初期化されているかどうか
let canvasInitFlag = false;



/*******************************************
*  メイン制御
********************************************/
window.addEventListener("load", () => {
  "use strict"

  /* SkyWayシグナリングサーバと接続 */
  multiparty = new MultiParty({
    "key": SKYWAY_API_KEY,
    "room": "test",
    "reliable": true,
    "audio": true,
    "turn": true
  });

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


  /* 接続が開いた場合 */
  multiparty.on("open", (myid) => {
    // 自分のIDと名前を保存
    myPeer.id = myid;
    myPeer.name = myid;
    peers[myPeer.id] = myPeer;

  }).on("my_ms", (ms) => {
    /* 自分のビデオを受け取ったとき */

    // ビデオを追加
    appendVideo(myPeer.id, ms);

  }).on("peer_ms", (ms) => {
    /* 別のピアのビデオを受け取ったとき */

    // ピアリストに追加
    if (peers[ms.id] === undefined) { peers[ms.id] = {}; }

    // 追加したピアのエイリアス
    let p = peers[ms.id];
    p.id = ms.id;
    p.streamOpen = true;
    p.stream = ms.src;

    // ビデオを追加
    appendVideo(p.id, ms);



  }).on("dc_open", (peerid) => {
    /* チャット用のチャネル */

    // ピアリストに追加
    if (peers[peerid] === undefined) { peers[peerid] = {}; }
    peers[peerid].chatOpen = true;

    // キャンバスが初期化されていない場合は初期化のためのキャンバスデータを送信してもらう
    if (!canvasInitFlag) {
      multiparty.send(JSON.stringify({ "type": "paint", "ope": "requestCanvasData" }));
    }

    // 名前を送信
    rename();

  }).on("message", (msg) => {
    /* メッセージ受信時 */

    let msgObj = JSON.parse(msg.data);
    switch (msgObj.type) {
      // 名前の変更
      case "rename":
        peers[msg.id].name = msgObj.name;
        renameGUI(msg.id);
        break;

      // チャット
      case "chat":
        // 名前の更新があった場合は，名前を更新
        if (peers[msg.id].name !== msgObj.name) {
          peers[msg.id].name = msgObj.name;
          renameGUI(msg.id);
        }

        // メッセージを追加
        appendMessage(msg.id, msgObj.message);

        break;

      // お絵かきのコマンドの場合
      case "paint":

        // さらに操作によって分岐
        switch (msgObj.ope) {
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
          case "importCanvasFromImage":
            canvasInitFlag = false;
          case "updateCanvasData":
            // まだキャンバスが初期化されていない場合
            if (!canvasInitFlag) {
              // イメージオブジェクトの生成
              let defaultImg = new Image(CANVAS_WIDTH, CANVAS_HEIGHT);
              defaultImg.src = msgObj.canvas;
              setTimeout(() => {
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

  }).on("ms_close", (peer_id) => {
    /* メディアチャネル切断時 */
    
    // ビデオを削除
    $(".talkView." + peer_id).remove();

  }).on("dc_close", (peerid) => {
    /* データチャネル切断時 */

    console.log(peerid + "(" + peers[peerid].name + ")が離脱");

  }).on("error", (error) => {
    /* エラー発生時 */
    switch (error.type) {
      case "browser-incompatible":
        alert("WebRTC対応ブラウザでアクセスしてください");
        break;
      default:
        switch (error.name) {
          case "PermissionDeniedError":
            alert("メディアアクセスを許可してください");
            //https://developer.mozilla.org/ja/docs/Web/API/MediaDevices/getUserMedia
            break;
          default:
            console.error(error);
            alert("しばらく時間をおいて再度試してみてください．(別ウィンドウで開くとうまくいくかも)");
        }
    }
  });

  /* メッセージの送信 */
  function sendMsg() {
    // メッセージの内容を取得
    const msg = $("#chatBox").val();

    // メッセージが空の場合は送信しない
    if (msg !== "") {

      // 送信
      multiparty.send(JSON.stringify({
        "id": myPeer.id,
        "name": myPeer.name,
        "type": "chat",
        "message": msg,
        "time": (new Date().getTime())
      }));

      // チャットエリアにメッセージを表示
      appendMessage(myPeer.id, msg);

      // メッセージボックスをクリア
      $("#chatBox").val("");
    }
  }
  $("#sendChatBtn").on("click", sendMsg);
  $("#sendChatForm").on("submit", (ev) => {
    ev.preventDefault();
    sendMsg();
  });


  /*******************************************
  *  お絵かき
  ********************************************/

  /* マウスを動かしたとき(描画する) */
  canvas.addEventListener("mousemove", (e) => {
    if (drawFlag) {

      // マウス位置の取得(canvas内の相対座標)
      let rect = e.target.getBoundingClientRect();
      point.x = e.clientX - rect.left;
      point.y = e.clientY - rect.top;

      // 線の描画
      drawLine(pen, point);

      // 描画を全員へ共有
      multiparty.send(JSON.stringify({ "type": "paint", "ope": "drawLine", "pen": pen, "point": point }));

      // 位置履歴の更新
      point.bx = point.x;
      point.by = point.y;
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    // クリック位置の取得
    let rect = e.target.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    switch (pen.mode) {
      case "pencil":
      case "eraser":
        drawFlag = true;
        // 位置の初期化
        point.bx = x;
        point.by = y;
        break;
      case "color-picker":
        // ピクセルデータを取得
        const data = ctx.getImageData(x, y, 1, 1).data;
        // 16進表現に変換
        pen.color = "#" + [data[0], data[1], data[2]].map(function (d) { return ("0" + d.toString(16)).slice(-2) }).join("");
        // 表示要素に反映
        updatePencilStyleCanvas();
        document.getElementById("colorPalette").value = pen.color;
        // 鉛筆に戻す
        pen.mode = "pencil";
        activateBtn(document.getElementById("pencilBtn"));
        break;
    }

  });

  canvas.addEventListener("mouseup", (e) => {
    drawFlag = false;
    // 動かさずにマウスを離したとき
    if ((point.bx !== point.x) && (point.by !== point.y)) {
      // マウス位置の取得(canvas内の相対座標)
      let rect = e.target.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;

      // 点の描画
      drawDot(pen, x, y);
      multiparty.send(JSON.stringify({ "type": "paint", "ope": "drawDot", "pen": pen, "x": x, "y": y }));
    }
  });


  /* キャンバスのクリア */
  document.getElementById("clearCanvasBtn").addEventListener("click", function () {
    clearCanvas();
    multiparty.send(JSON.stringify({ "type": "paint", "ope": "clearCanvas" }));
  });

  /* 鉛筆モード */
  document.getElementById("pencilBtn").addEventListener("click", function () {
    pen.mode = "pencil";
  });

  /* 消しゴムモード */
  document.getElementById("eraserBtn").addEventListener("click", function () {
    pen.mode = "eraser";
  });

  /* カラーピッカーモード */
  document.getElementById("colorPickerBtn").addEventListener("click", function () {
    pen.mode = "color-picker";
  });

  /* 塗りつぶしモード */
  document.getElementById("fillBtn").addEventListener("click", function () {
    pen.mode = "fillBucket";
  });

  /* 色の変更 */
  document.getElementById("colorPalette").addEventListener("change", function () {
    pen.color = this.value;
    updatePencilStyleCanvas();
  });

  /* 太さの変更 */
  document.getElementById("thicknessRanger").addEventListener("input", function () {
    pen.width = this.value;
    document.getElementById("thicknessMeter").textContent = pen.width;
    updatePencilStyleCanvas();
  });

  /* 画像のダウンロード */
  document.getElementById("downloadLink").addEventListener("click", function (ev) {
    this.href = canvas.toDataURL();
    this.download = "image";
  }, false);

  /* ファイルからインポート */
  document.getElementById("importImage").addEventListener("change", function (evt) {
    let file = evt.target.files;
    let reader = new FileReader();

    //dataURL形式でファイルを読み込む
    reader.readAsDataURL(file[0]);

    //ファイルの読込が終了した時の処理
    reader.onload = function () {
      // DataURLに変換
      let imgData = reader.result;
      let defaultImg = new Image(CANVAS_WIDTH, CANVAS_HEIGHT);
      defaultImg.src = imgData;

      let ix = 0;
      let iy = 0;
      let insertPointInput = prompt("挿入する座標 x,y", "0,0");
      if (insertPointInput) {
        let insertPoint = insertPointInput.split(",");
        if (insertPoint.length <= 2) {
          ix = parseInt(insertPoint[0]);
          iy = parseInt(insertPoint[1]);
        }
      }


      // キャンバスに反映
      setTimeout(() => {
        ctx.drawImage(defaultImg, ix, iy);
        // 全員に送信
        multiparty.send(JSON.stringify({
          "type": "paint",
          "ope": "importCanvasFromImage",
          "canvas": canvas.toDataURL()
        }));
      }, 50);

    }
  }, false);

  /* ペン切り替えボタンのクリック状態 */
  for (let elm of document.getElementsByClassName("pen-btn")) {
    elm.addEventListener("click", function () {
      activateBtn(this);
    }, false);
  }

  /* 線を引く */
  function drawLine(pen, point) {
    setColor(pen);
    ctx.lineWidth = pen.width;   // 線の太さ
    ctx.lineCap = "round";  // 線の終端
    ctx.beginPath();
    ctx.moveTo(point.bx, point.by);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.closePath();
  }

  /* 点を打つ */
  function drawDot(pen, x, y) {
    setColor(pen);
    ctx.beginPath();
    ctx.arc(x, y, pen.width / 2, 0, Math.PI * 2, false);
    ctx.fill();

  }


  /* キャンバスをクリア */
  function clearCanvas() {
    // 背景を透明にするかどうかで分岐
    if (BACKGROUND_TRANSPARENCE) {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      ctx.fillStyle = BACKGROUND_COLOR;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }

  /* 鉛筆のスタイル見本を更新 */
  function updatePencilStyleCanvas() {
    // 
    const thickness = pen.width;
    pctx.clearRect(0, 0, pcanvas.width, pcanvas.height);
    pctx.fillStyle = pen.color;
    pctx.beginPath();
    pctx.arc(pcanvas.width / 2, pcanvas.height / 2, thickness / 2, 0, Math.PI * 2, false);
    pctx.stroke();
    pctx.fill();
  }

  /* 消しゴムか判断して色を指定 */
  function setColor(pen) {
    switch (pen.mode) {
      case "pencil":
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = pen.color;  // 色を指定
        break;

      case "eraser":
        if (BACKGROUND_TRANSPARENCE) {
          // 透明に
          ctx.globalCompositeOperation = "destination-out";
        } else {
          // 白で塗りつぶし
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = BACKGROUND_COLOR;
        }
        break;
    }
  }

  /* 指定したボタンをアクティブにする */
  function activateBtn(target) {
    for (let elm of document.getElementsByClassName("pen-btn active")) {
      elm.classList.remove("active");
    }
    target.classList.add("active");
  }


  // ペンのスタイルのプレビューとキャンバスを初期化
  updatePencilStyleCanvas();
  clearCanvas();

  // 接続開始
  multiparty.start();

  /*******************************************
  *  名前の変更
  ********************************************/

  /* 送信されたら名前の変更 */
  $("#rename-new-name-forms").on("submit", function (ev) {
    ev.preventDefault();
    rename();
  });
  $("#rename-ok-button").on("click", function () {
    rename();
  });

  /* 表示されたら入力欄にフォーカス */
  $('#rename-modal').on('shown.bs.modal', function () {
    $('#rename-new-name-form').focus();
  })

  /* チャットやビデオの名前を更新 */
  function renameGUI(peerid) {
    $(".user-name." + peerid).text(peers[peerid].name);
  }

  function rename() {
    myPeer.name = $("#rename-new-name-form").val();
    setTimeout(() => {
      multiparty.send(JSON.stringify({
        "id": myPeer.id,
        "type": "rename",
        "name": myPeer.name,
        "time": (new Date().getTime())
      }));
    }, 500);
    renameGUI(myPeer.id);
    $("#rename-modal").modal("hide");
  }


  /*******************************************
  *  ログアウト
  ********************************************/
  $("#logoutBtn").on("click", function (ev) {
    ev.preventDefault();
    multiparty.close();
    console.log("ログアウト");
  });

  /*******************************************
  *  共有メソッド
  ********************************************/

  /* メッセージを追加 */
  function appendMessage(peerid, msg){
    $("#chat-log-area").prepend(`
      <div class="chat-message-box">
        <figure class="chat-user-icon">
          <img class="avatar" src="icons/user_icon.png">
          <figcaption class="user-name chat ${peerid}">${peers[peerid].name}</figcaption>
        </figure>
        <div class="chat-message-area">
          <div class="chat-message-content${peerid === myPeer.id ? " me" : ""}">${msg}</div>
        </div>
      </div>
    `);
  }

  /*  ビデオを追加 */
  function appendVideo(peerid, objUrl){
    // ノードの生成
    let vNode = MultiParty.util.createVideoNode(objUrl);

    // ビデオが自分のものなら，ミュートに
    if(peerid === myPeer.id){
      vNode.volume = 0;
    }
    $("#streams").append(`
      <div class="panel panel-default talkView ${peerid}">
        <div class="panel-heading text-center">
          <h3 class="panel-title user-name talk ${peerid}">${peerid === myPeer.id ? "自分" : peers[peerid].name}</h3>
        </div>
        <div class="panel-body ${peerid}"></div>
      </div>
    `);
    $(".panel-body." + peerid).append($(vNode).addClass("talk-video"));
  }



}, false);

console.log("読み込み完了");