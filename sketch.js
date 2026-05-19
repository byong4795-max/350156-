let peer;
let myId;
let video; // 手機端是本地相機，電腦端是接收到的遠端影像
let handPose;
let hands = [];
let currentAction = 0;
let isPhone = false;
let remoteStreamReady = false;
let connectionStatus = "初始化中..."; // Added for status display
let qrcodeGenerated = false; // 確保 QR Code 只產生一次
let peerError = null; // Added for error display

function setup() {
  createCanvas(windowWidth, windowHeight);

  const urlParams = new URLSearchParams(window.location.search);
  const room = urlParams.get('room');

  // 建立 PeerJS 物件，加入明確的 STUN 伺服器配置以利跨網路連線
  const peerConfig = {
    config: {
      'iceServers': [
        { url: 'stun:stun.l.google.com:19302' },
        { url: 'stun:stun1.l.google.com:19302' }
      ]
    }
  };

  if (room) {
    // 手機端模式
    isPhone = true;
    connectionStatus = "請求相機權限...";
    video = createCapture(VIDEO, (stream) => {
      connectionStatus = "正在建立通訊伺服器連線...";
      peer = new Peer(peerConfig);
      peer.on('open', (id) => {
        myId = id; // Store phone's ID too
        peer.call(room, stream); // 撥號給電腦
        connectionStatus = "正在連線至電腦端...";
      });
      peer.on('error', (err) => {
        console.error("PeerJS Error (Phone):", err);
        peerError = err.type;
        connectionStatus = "連線失敗: " + err.type;
      });
      peer.on('close', () => {
        connectionStatus = "連線已關閉 (Phone)";
      });
    }, (err) => { // Error callback for createCapture
      console.error("Camera access error (Phone):", err);
      connectionStatus = "無法存取相機: " + err.name;
    });
    video.size(640, 480);
    video.hide();
  } else {
    // 電腦端模式
    peer = new Peer(peerConfig);
    peer.on('open', (id) => {
      myId = id;
      connectionStatus = "等待手機連線...";
      if (typeof updateQRCode === 'function' && !qrcodeGenerated) {
        updateQRCode(id);
        qrcodeGenerated = true;
      }
    });
    peer.on('error', (err) => {
      console.error("PeerJS Error (PC):", err);
      peerError = err.type;
      connectionStatus = "連線失敗: " + err.type;
    });
    peer.on('close', () => {
      connectionStatus = "連線已關閉 (PC)";
    });
    peer.on('call', (call) => {
      connectionStatus = "手機已連線，正在接收影像...";
      call.answer(); // 接聽手機的來電
      call.on('stream', (stream) => {
        console.log("收到手機影像串流");
        if (video) video.remove(); 
        video = createVideo('');
        video.elt.setAttribute('playsinline', 'true');
        video.elt.setAttribute('autoplay', 'true');
        video.elt.srcObject = stream;
        video.elt.muted = true; // 避免回音
        video.hide();
        
        remoteStreamReady = true; // 立即開啟顯示模式
        
        // 初始化 HandPose 偵測
        handPose = ml5.handPose(() => {
          console.log("HandPose 模型已準備好");
          handPose.detectStart(video, results => { hands = results; });
        });
      });
      call.on('close', () => {
        connectionStatus = "手機連線已中斷";
        remoteStreamReady = false;
        video = null; // Clear video
      });
    });
  }
}

function draw() {
  background(0);
  
  let boxW = 640;
  let boxH = 480;
  let x = (width - boxW) / 2;
  let y = (height - boxH) / 2;

  if (isPhone) {
    // 手機端：顯示自己的鏡頭當作預覽
    if (video && video.elt.readyState === 4) { // Check if video is ready
      image(video, 0, 0, width, height, 0, 0, video.width, video.height, COVER);
    } else {
      background(0); // Ensure background is black if video not ready
    }
    
    // 狀態顯示
    fill(0, 150);
    noStroke();
    rect(0, height - 100, width, 100);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(20);
    text(connectionStatus, width / 2, height - 65);
    if (peerError) {
      fill(255, 100, 100);
      text("錯誤: " + peerError, width / 2, height - 35);
    }
  } else {
    // 電腦端繪製
    stroke(255);
    noFill();
    rect(x, y, boxW, boxH);

    if (remoteStreamReady && video) { 
      // 使用底層繪圖，確保影像即時顯示，不受寬高載入影響
      drawingContext.drawImage(video.elt, x, y, boxW, boxH);
      drawHandRecognition(x, y);
    } else {
      fill(255);
      noStroke();
      textSize(24);
      textAlign(CENTER, CENTER);
      
      if (peerError) {
        fill(255, 100, 100);
        text('連線錯誤: ' + peerError, width / 2, height / 2 - 20);
        textSize(16);
        text('請檢查瀏覽器控制台是否有更多錯誤訊息', width / 2, height / 2 + 20);
      } else {
        text(connectionStatus, width / 2, height / 2);
      }
    }
  }

  // 學生資訊
  fill(255);
  noStroke();
  textSize(20);
  textAlign(CENTER, CENTER);
  text('414730050 曹苡萱', width / 2, y - 20);
}

function drawHandRecognition(offsetX, offsetY) {
  // 使用 handPose 結果繪製點位並分類
  if (!hands || hands.length === 0) {
    currentAction = 0; // 偵測中...
  } else {
    const hand = hands[0];

    // 繪製手部關鍵點
    hand.keypoints.forEach(k => {
      fill(0, 255, 150);
      noStroke();
      ellipse(offsetX + k.x, offsetY + k.y, 8, 8);
    });

    // 動作分類 (基於手指數量)
    currentAction = classifyPose(hand);
  }

  // 將動作編號映射為中文猜拳名稱
  const actionNames = ["偵測中...", "剪刀", "石頭", "布"];

  // 在中間框框顯示醒目的辨識結果
  noStroke();
  fill(0, 180); // 深色背景框
  rectMode(CENTER);
  rect(offsetX + 320, offsetY + 240, 320, 120, 20); 

  fill(255, 255, 0); // 鮮艷黃色
  textSize(80);      // 特大字體
  textAlign(CENTER, CENTER);
  text(actionNames[currentAction], offsetX + 320, offsetY + 240);
  rectMode(CORNER);  // 還原繪圖模式以免影響其他部分
}

function classifyPose(hand) {
  if (!hand || !hand.keypoints) return 0;
  const k = hand.keypoints;
  let count = 0;

  // 檢查四指 (食指 8, 中指 12, 無名指 16, 小指 20)
  // 當指尖(tip)的 Y 座標小於指根(pip)時，視為伸出
  if (k[8].y < k[5].y) count++;   // 食指
  if (k[12].y < k[9].y) count++;  // 中指
  if (k[16].y < k[13].y) count++; // 無名指
  if (k[20].y < k[17].y) count++; // 小指

  // 檢查大拇指 (4)
  // 利用大拇指尖端與小指底部的距離來判斷是否伸開
  let thumbTip = k[4];
  let thumbBase = k[2];
  let pinkyBase = k[17];
  if (dist(thumbTip.x, thumbTip.y, pinkyBase.x, pinkyBase.y) > 
      dist(thumbBase.x, thumbBase.y, pinkyBase.x, pinkyBase.y)) {
    count++;
  }

  // 嚴格依照 user 要求的數量判定
  if (count === 0) return 2; // 石頭
  if (count === 2) return 1; // 剪刀
  if (count === 5) return 3; // 布
  return 0; // 其他數量顯示偵測中
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}