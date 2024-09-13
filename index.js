require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const app = express();
const port = 8080;
const dynamoDb = new AWS.DynamoDB.DocumentClient();

app.use(cors({
  origin: 'http://44.196.241.153:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
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

// Função para gerar ID único para o arquivo
function generateUniqueFileId() {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Função para armazenar metadados no DynamoDB
async function storeFileMetadata(fileId, versionNumber, s3Url) {
  const params = {
    TableName: 'FileMetadata',
    Item: {
      FileID: fileId,
      VersionNumber: versionNumber,
      S3Url: s3Url,
      Timestamp: new Date().toISOString() // Adiciona um timestamp
    }
  };

  try {
    await dynamoDb.put(params).promise();
    console.log('Metadata stored successfully');
  } catch (error) {
    console.error('Error storing metadata:', error);
  }
}

// Rota para upload de arquivos
app.post('/upload', upload.single('file'), async (req, res) => {
  const fileStream = fs.createReadStream(req.file.path);
  
  const fileId = generateUniqueFileId();
  const versionNumber = 1; // Para controle de versão, pode ser incrementado conforme necessário

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Body: fileStream,
    Key: `files/${fileId}_${req.file.originalname}`, // Nome do arquivo no S3
  };

  try {
    // Upload para o S3
    const data = await s3.upload(params).promise();
    console.log(`File uploaded successfully. ${data.Location}`);

    // Armazenar metadados no DynamoDB
    await storeFileMetadata(fileId, versionNumber, data.Location);

    // Responder ao cliente
    res.status(200).json({
      message: 'File uploaded successfully',
      fileUrl: data.Location
    });
  } catch (err) {
    console.log("Error", err);
    res.status(500).send('Error uploading file');
  } finally {
    // Limpar arquivos temporários
    fs.unlinkSync(req.file.path);
  }
});

// Rota para listar arquivos
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
