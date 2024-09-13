require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const app = express();
const port = 8080;

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

const upload = multer({ dest: 'uploads/' });
const s3 = new AWS.S3();

function generateUniqueFileId() {
  const timestamp = Date.now();
  const randomPart = Math.floor(Math.random() * 1000000); 
  return timestamp * 1000000 + randomPart;
}

const dynamoDb = new AWS.DynamoDB.DocumentClient();

async function storeFileMetadata(fileId, versionNumber, fileMetadata, fileUrl) {
  const params = {
    TableName: 'dochub-file-metadata',
    Item: {
      FileID: fileId,
      VersionNumber: versionNumber,
      Metadata: fileMetadata,
      FileUrl: fileUrl,
      Timestamp: new Date().toISOString()
    }
  };

  try {
    await dynamoDb.put(params).promise();
    console.log('Metadata stored successfully');
  } catch (error) {
    console.error('Error storing metadata:', error);
  }
}

app.post('/upload', upload.single('file'), async (req, res) => {
  const fileStream = fs.createReadStream(req.file.path);
  
  const fileId = generateUniqueFileId();
  const versionNumber = 1; 

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

app.get('/files/metadata', async (req, res) => {
  const params = {
      TableName: 'dochub-file-metadata' // Nome da sua tabela do DynamoDB
  };

  try {
      const data = await dynamoDb.scan(params).promise(); // Usa o scan para listar todos os itens
      const files = data.Items.map(item => ({
          fileId: item.FileID,
          versionNumber: item.VersionNumber,
          metadata: item.Metadata,
          fileUrl: item.FileUrl,
          timestamp: item.Timestamp
      }));
      res.status(200).json(files);
  } catch (err) {
      console.error('Error listing file metadata:', err);
      res.status(500).send('Error listing file metadata');
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
