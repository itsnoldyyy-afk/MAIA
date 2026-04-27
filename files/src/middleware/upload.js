const multer = require("multer");
const path = require("path");
const fs = require("fs");
function makeStorage(folder) {
  return multer.diskStorage({
    destination: (req, file, cb) => { const dir = path.join(__dirname, "../../uploads", folder); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
    filename: (req, file, cb) => { cb(null, folder + "_" + Date.now() + path.extname(file.originalname)); }
  });
}
const imageFilter = (req, file, cb) => {
  [".jpg",".jpeg",".png",".webp"].includes(path.extname(file.originalname).toLowerCase()) ? cb(null,true) : cb(new Error("Images only"),false);
};
const photoUpload = multer({ storage: makeStorage("photos"), fileFilter: imageFilter, limits: { fileSize: 5*1024*1024 } });
const idUpload = multer({ storage: makeStorage("ids"), fileFilter: imageFilter, limits: { fileSize: 5*1024*1024 } });
module.exports = { photoUpload, idUpload };
