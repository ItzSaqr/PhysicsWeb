let canvas, ctx, maskCanvas, maskCtx, editCanvas, editCtx, cropCanvas, cropCtx;
let currentImage = null;
let originalImage = null; // Исходное изображение после загрузки
let initialCropImage = null; // Состояние до первой обрезки (для возврата размеров)
let initialEditImage = null; // Состояние после обрезки, но до рисования (для возврата без нарисованного)
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
    cropCanvas = document.getElementById('cropCanvas');
    cropCtx = cropCanvas.getContext('2d');
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

    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    maskCanvas.width = currentImage.width;
    maskCanvas.height = currentImage.height;

    const maxRectWidth = currentImage.width * 1.5;
    const maxRectHeight = currentImage.height * 1.5;
    const rectWidthValue = Math.min(width, maxRectWidth);
    const rectHeightValue = Math.min(height, maxRectHeight);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(currentImage, 0, 0);
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, rectWidthValue, rectHeightValue);

    const { pixels, mask } = countEnclosedPixels(canvas, rectWidthValue, rectHeightValue, threshold, invert);
    cv.imshow(maskCanvas, mask);
    document.getElementById('pixelCount').textContent = `Площадь: ${pixels.toFixed(2)}`;
    mask.delete();
}

function applyCropToCanvas(ctx, canvas, image, cropLeft, cropTop, cropRight, cropBottom) {
    const imgWidth = image.width;
    const imgHeight = image.height;
    const cropX = (imgWidth * cropLeft) / 100;
    const cropY = (imgHeight * cropTop) / 100;
    const cropWidth = imgWidth - cropX - (imgWidth * cropRight) / 100;
    const cropHeight = imgHeight - cropY - (imgHeight * cropBottom) / 100;

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
}

function applyCrop(image, cropLeft, cropTop, cropRight, cropBottom) {
    const imgWidth = image.width;
    const imgHeight = image.height;
    const cropX = (imgWidth * cropLeft) / 100;
    const cropY = (imgHeight * cropTop) / 100;
    const cropWidth = imgWidth - cropX - (imgWidth * cropRight) / 100;
    const cropHeight = imgHeight - cropY - (imgHeight * cropBottom) / 100;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropWidth;
    tempCanvas.height = cropHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const croppedImage = new Image();
    croppedImage.src = tempCanvas.toDataURL();
    return croppedImage;
}

function resetCropSliders() {
    document.getElementById('cropLeft').value = 0;
    document.getElementById('cropTop').value = 0;
    document.getElementById('cropRight').value = 0;
    document.getElementById('cropBottom').value = 0;
}

function setupEventListeners() {
    document.getElementById('imageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            originalImage = new Image();
            originalImage.src = img.src;
            initialCropImage = new Image(); // Сохраняем исходное изображение при загрузке
            initialCropImage.src = img.src;
            initialEditImage = null; // Сбрасываем при загрузке нового изображения
            processImage();
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

    document.getElementById('instructionButton').addEventListener('click', () => {
        document.getElementById('instructionModal').style.display = 'flex';
    });

    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('instructionModal').style.display = 'none';
    });

    document.getElementById('editButton').addEventListener('click', () => {
        if (!currentImage) {
            alert('Сначала выберите изображение!');
            return;
        }
        cropCanvas.width = currentImage.width;
        cropCanvas.height = currentImage.height;
        cropCtx.drawImage(currentImage, 0, 0);
        resetCropSliders(); // Сбрасываем ползунки при открытии
        document.getElementById('cropModal').style.display = 'flex';
    });

    const cropInputs = ['cropLeft', 'cropTop', 'cropRight', 'cropBottom'];
    cropInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            const cropLeft = parseInt(document.getElementById('cropLeft').value);
            const cropTop = parseInt(document.getElementById('cropTop').value);
            const cropRight = parseInt(document.getElementById('cropRight').value);
            const cropBottom = parseInt(document.getElementById('cropBottom').value);

            applyCropToCanvas(cropCtx, cropCanvas, currentImage, cropLeft, cropTop, cropRight, cropBottom);
        });
    });

    document.getElementById('saveCrop').addEventListener('click', () => {
        const cropLeft = parseInt(document.getElementById('cropLeft').value);
        const cropTop = parseInt(document.getElementById('cropTop').value);
        const cropRight = parseInt(document.getElementById('cropRight').value);
        const cropBottom = parseInt(document.getElementById('cropBottom').value);

        currentImage = applyCrop(currentImage, cropLeft, cropTop, cropRight, cropBottom);
        currentImage.onload = () => {
            if (!initialEditImage) { // Сохраняем состояние после первой обрезки, но до рисования
                initialEditImage = new Image();
                initialEditImage.src = currentImage.src;
            }
            document.getElementById('cropModal').style.display = 'none';
            editCanvas.width = currentImage.width;
            editCanvas.height = currentImage.height;
            editCtx.drawImage(currentImage, 0, 0);
            document.getElementById('editModal').style.display = 'flex';
        };
    });

    document.getElementById('clearCrop').addEventListener('click', () => {
        resetCropSliders(); // Сбрасываем ползунки в ноль
        cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
        if (initialCropImage) {
            cropCanvas.width = initialCropImage.width;
            cropCanvas.height = initialCropImage.height;
            cropCtx.drawImage(initialCropImage, 0, 0); // Восстанавливаем только исходные размеры
            currentImage = new Image();
            currentImage.src = initialCropImage.src; // Возвращаем currentImage к состоянию до обрезки
            initialEditImage = null; // Сбрасываем, чтобы при следующем сохранении обновилось
        }
    });

    document.getElementById('saveEdit').addEventListener('click', () => {
        currentImage = new Image();
        currentImage.src = editCanvas.toDataURL();
        currentImage.onload = () => {
            document.getElementById('editModal').style.display = 'none';
            processImage();
        };
    });

    document.getElementById('clearEdit').addEventListener('click', () => {
        editCtx.clearRect(0, 0, editCanvas.width, editCanvas.height);
        if (initialEditImage) {
            editCtx.drawImage(initialEditImage, 0, 0); // Восстанавливаем состояние после обрезки, без нарисованного
        } else if (currentImage) {
            editCtx.drawImage(currentImage, 0, 0); // Если нет initialEditImage, используем текущее
        }
    });

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

    editCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = editCanvas.getBoundingClientRect();
            const scaleX = editCanvas.width / rect.width;
            const scaleY = editCanvas.height / rect.height;
            const offsetX = (touch.clientX - rect.left) * scaleX;
            const offsetY = (touch.clientY - rect.top) * scaleY;
            isDrawing = true;
            editCtx.beginPath();
            editCtx.moveTo(offsetX, offsetY);
        }
    });

    editCanvas.addEventListener('touchmove', (e) => {
        if (isDrawing && e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = editCanvas.getBoundingClientRect();
            const scaleX = editCanvas.width / rect.width;
            const scaleY = editCanvas.height / rect.height;
            const offsetX = (touch.clientX - rect.left) * scaleX;
            const offsetY = (touch.clientY - rect.top) * scaleY;
            editCtx.lineTo(offsetX, offsetY);
            editCtx.strokeStyle = 'black';
            editCtx.lineWidth = 10;
            editCtx.stroke();
        } else {
            e.preventDefault();
        }
    });

    editCanvas.addEventListener('touchend', () => {
        isDrawing = false;
    });

    editCanvas.addEventListener('touchcancel', () => {
        isDrawing = false;
    });

            document.getElementById('themeToggle').addEventListener('click', function() {
            document.body.classList.toggle('light-theme');
            const icon = this.querySelector('i');
            if (document.body.classList.contains('light-theme')) {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            } else {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            }
        });

        document.getElementById('languageSelect').addEventListener('change', function() {
            const lang = this.value;
            console.log('Язык изменен на: ' + lang);
            // Здесь можно добавить логику перевода
        });
}