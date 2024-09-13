require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const fs = require('fs');;
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const app = express();
const port = 8080;

app.use(cors({
  origin: 'http://54.237.83.234:3001' 
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração do AWS S3
AWS.config.update({
    sessionToken: process.env.SESSION_TOKEN,
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Configuração do multer para upload de arquivos
const upload = multer({ dest: 'uploads/' });
const s3 = new AWS.S3();
// Rota para upload de arquivos
app.post('/upload', upload.single('file'), async (req, res) => {
    const fileStream = fs.createReadStream(req.file.path);
    fileStream
      .on('error', function(err) {
        console.error('Error:', err);
      })
      .on('upload', function(bytesUploaded, totalSize) {
        console.log(`${bytesUploaded} of ${totalSize} bytes read`);
      });

    const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Body: fileStream,
        Key: `files/${Date.now()}_${req.file.originalname}`, // Nome do arquivo no S3
    };

    s3.upload(params, function(err, data) {
        if (err) {
          console.log("Error", err);
        } else {
          console.log(`File uploaded successfully. ${data.Location}`);
        }
    });
});

app.get('/files', async (req, res) => {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: 'files/', // Se você quiser listar apenas arquivos em um prefixo específico
    };
  
    try {
      const data = await s3.listObjectsV2(params).promise();
      const files = data.Contents.map(file => ({
        key: file.Key,
        url: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.Key}`
      }));
      res.status(200).json(files);
    } catch (err) {
      console.error('Error listing files:', err);
      res.status(500).send('Error listing files');
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
