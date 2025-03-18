let canvas, ctx, maskCanvas, maskCtx, editCanvas, editCtx;
let currentImage = null;
let rectX = 0, rectY = 0;
let isDrawing = false;

function onOpenCvReady() {
    console.log("OpenCV.js готов!");
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    maskCanvas = document.getElementById('maskCanvas');
    maskCtx = maskCanvas.getContext('2d');
    editCanvas = document.getElementById('editCanvas');
    editCtx = editCanvas.getContext('2d');
    setupEventListeners();
}

function countEnclosedPixels(imageCanvas, width, height, threshold, invert) {
    let src = cv.imread(imageCanvas);
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    if (invert) {
        cv.bitwise_not(gray, gray);
    }

    let binary = new cv.Mat();
    cv.threshold(gray, binary, threshold, 255, cv.THRESH_BINARY_INV);

    let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Находим самый большой контур
    let maxArea = 0;
    let maxContourIndex = -1;
    for (let i = 0; i < contours.size(); i++) {
        let contourArea = cv.contourArea(contours.get(i));
        if (contourArea > maxArea) {
            maxArea = contourArea;
            maxContourIndex = i;
        }
    }

    let mask = new cv.Mat.zeros(binary.rows, binary.cols, cv.CV_8U);
    if (maxContourIndex !== -1) {
        cv.drawContours(mask, contours, maxContourIndex, new cv.Scalar(255), cv.FILLED);
    }

    let enclosedPixels = cv.countNonZero(mask);
    if (width > 0 && height > 0) {
        enclosedPixels /= (width * height);
    }

    gray.delete(); binary.delete(); kernel.delete();
    contours.delete(); hierarchy.delete(); src.delete();

    return { pixels: enclosedPixels, mask: mask };
}

function processImage() {
    if (!currentImage) return;

    const width = parseInt(document.getElementById('rectWidth').value);
    const height = parseInt(document.getElementById('rectHeight').value);
    const threshold = parseInt(document.getElementById('threshold').value);
    const invert = document.getElementById('invert').checked;
    const cropLeft = parseInt(document.getElementById('cropLeft').value);
    const cropTop = parseInt(document.getElementById('cropTop').value);
    const cropRight = parseInt(document.getElementById('cropRight').value);
    const cropBottom = parseInt(document.getElementById('cropBottom').value);

    // Расчет области обрезки
    const imgWidth = currentImage.width;
    const imgHeight = currentImage.height;
    const cropX = (imgWidth * cropLeft) / 100;
    const cropY = (imgHeight * cropTop) / 100;
    const cropWidth = imgWidth - cropX - (imgWidth * cropRight) / 100;
    const cropHeight = imgHeight - cropY - (imgHeight * cropBottom) / 100;

    // Обновление размеров канваса
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    maskCanvas.width = cropWidth;
    maskCanvas.height = cropHeight;

    const maxRectWidth = cropWidth * 1.5;
    const maxRectHeight = cropHeight * 1.5;
    const rectWidthValue = Math.min(width, maxRectWidth);
    const rectHeightValue = Math.min(height, maxRectHeight);

    // Отрисовка обрезанного изображения и прямоугольника
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(currentImage, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, rectWidthValue, rectHeightValue);

    // Подсчет пикселей и создание маски
    const { pixels, mask } = countEnclosedPixels(canvas, rectWidthValue, rectHeightValue, threshold, invert);
    cv.imshow(maskCanvas, mask);
    document.getElementById('pixelCount').textContent = `Площадь: ${pixels.toFixed(2)}`;
    mask.delete();
}

function setupEventListeners() {
    document.getElementById('imageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            editCanvas.width = img.width;
            editCanvas.height = img.height;
            editCtx.drawImage(img, 0, 0);
            document.getElementById('editModal').style.display = 'flex';
        };
        img.src = URL.createObjectURL(file);
    });

    document.getElementById('rectX').addEventListener('input', (e) => {
        rectX = parseInt(e.target.value);
        processImage();
    });

    document.getElementById('rectY').addEventListener('input', (e) => {
        rectY = parseInt(e.target.value);
        processImage();
    });

    document.querySelectorAll('.controls input').forEach(input => {
        input.addEventListener('input', processImage);
    });

    // Открытие модального окна с инструкцией
    document.getElementById('instructionButton').addEventListener('click', () => {
        document.getElementById('instructionModal').style.display = 'flex';
    });

    // Закрытие модального окна
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('instructionModal').style.display = 'none';
    });

    // Сохранение отредактированного изображения
    document.getElementById('saveEdit').addEventListener('click', () => {
        currentImage = new Image();
        currentImage.src = editCanvas.toDataURL();
        document.getElementById('editModal').style.display = 'none';
        processImage(); // Вызываем processImage сразу после сохранения
    });

    // Очистка Canvas
    document.getElementById('clearEdit').addEventListener('click', () => {
        editCtx.clearRect(0, 0, editCanvas.width, editCanvas.height);
        editCtx.drawImage(currentImage, 0, 0);
    });

    // Рисование на Canvas (мышь)
    editCanvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        editCtx.beginPath();
        editCtx.moveTo(e.offsetX, e.offsetY);
    });

    editCanvas.addEventListener('mousemove', (e) => {
        if (isDrawing) {
            editCtx.lineTo(e.offsetX, e.offsetY);
            editCtx.strokeStyle = 'black';
            editCtx.lineWidth = 10;
            editCtx.stroke();
        }
    });

    editCanvas.addEventListener('mouseup', () => {
        isDrawing = false;
    });

    editCanvas.addEventListener('mouseleave', () => {
        isDrawing = false;
    });

    // Рисование на Canvas (сенсорные устройства)
    editCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) { // Рисуем только при одном касании
            const touch = e.touches[0];
            const rect = editCanvas.getBoundingClientRect();
            const scaleX = editCanvas.width / rect.width; // Масштабирование по X
            const scaleY = editCanvas.height / rect.height; // Масштабирование по Y
            const offsetX = (touch.clientX - rect.left) * scaleX;
            const offsetY = (touch.clientY - rect.top) * scaleY;
            isDrawing = true;
            editCtx.beginPath();
            editCtx.moveTo(offsetX, offsetY);
        }
    });

    editCanvas.addEventListener('touchmove', (e) => {
        if (isDrawing && e.touches.length === 1) { // Рисуем только при одном касании
            const touch = e.touches[0];
            const rect = editCanvas.getBoundingClientRect();
            const scaleX = editCanvas.width / rect.width; // Масштабирование по X
            const scaleY = editCanvas.height / rect.height; // Масштабирование по Y
            const offsetX = (touch.clientX - rect.left) * scaleX;
            const offsetY = (touch.clientY - rect.top) * scaleY;
            editCtx.lineTo(offsetX, offsetY);
            editCtx.strokeStyle = 'black';
            editCtx.lineWidth = 10;
            editCtx.stroke();
        } else {
            // Если не рисуем, разрешаем прокрутку страницы
            e.preventDefault();
        }
    });

    editCanvas.addEventListener('touchend', () => {
        isDrawing = false;
    });

    editCanvas.addEventListener('touchcancel', () => {
        isDrawing = false;
    });
}