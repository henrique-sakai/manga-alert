const axios = require('axios');
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REG });
const s3 = new AWS.S3();
const bucketParams = {
  Bucket: process.env.S3_BUCKET,
  Key: process.env.S3_KEY
};

module.exports.handler = async (event) => {
  let mangas = await readMangasFile();
  mangas = JSON.parse(mangas);

  const newChapters = await getNewChapters(mangas);

  if (Object.keys(newChapters).length !== 0) {
    updateMangasFile(mangas, newChapters);
    const content = createEmailContent(newChapters);
    await sendSES(content);
  }

  return newChapters;
}

const readMangasFile = async () => {
  const file = await s3.getObject(bucketParams).promise();
  return file.Body.toString();
}

const updateMangasFile = async (mangas, newChapters) => {
  for (const title in newChapters) {
    mangas[title] = newChapters[title];
  }

  await s3.putObject({
    ...bucketParams,
    Body: JSON.stringify(mangas)
  }).promise();
}

const getNewChapters = async (mangas) => {
  let newChapters = {};

  for (const title in mangas) {
    const manga = mangas[title];
    const lastChapter = await getLastChapter(manga.pathName);
    if (lastChapter > manga.lastChapter) {
      manga.lastChapter = parseInt(lastChapter);
      manga.lastChapterUrl = `https://www.mngdoom.com/${manga.pathName}/${manga.lastChapter}`;
      newChapters[title] = manga;
    }
  }

  return newChapters;
}

const getLastChapter = async (mangaTitle) => {
  const request = await axios.get(`https://www.mngdoom.com/${mangaTitle}`);
  const HTML = request.data;
  const bar = '/';
  let chapterList;

  const ulStart = HTML.indexOf(`<ul class="chapter-list">`);
  chapterList = HTML.substring(ulStart, HTML.length);

  const listStart = chapterList.indexOf(`<li>`);
  const listEnd = chapterList.indexOf('</ul>');
  chapterList = chapterList.substring(listStart, listEnd);

  //<a href="https://www.mngdoom.com/kingdom/640">
  const lastChapterNumberStart = chapterList.indexOf(mangaTitle) + mangaTitle.length + bar.length;
  const lastChapterNumberEnd = chapterList.indexOf(`">`);
  const lastChapter = chapterList.substring(lastChapterNumberStart, lastChapterNumberEnd);

  return lastChapter;
}

const createEmailContent = (newChapters) => {
  let content = '';

  for (const title in newChapters) {
    content = `${content}<p>${newChapters[title].lastChapterUrl}</p>`;
  }

  return content;
}

const sendSES = async (content) => {
  const sender = process.env.EMAIL_FROM;
  const recipient = process.env.EMAIL_TO;

  const subject = "New manga chapter";

  const charset = "UTF-8";

  const ses = new AWS.SES();

  const params = {
    Source: sender,
    Destination: {
      ToAddresses: [
        recipient
      ],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: charset
      },
      Body: {
        Text: {
          Data: 'Chapter links',
          Charset: charset
        },
        Html: {
          Data: content,
          Charset: charset
        }
      }
    }
  };

  ses.sendEmail(params, function (err, data) {
    if (err) {
      console.log(err.message);
    } else {
      console.log("Email sent! Message ID: ", data.MessageId);
    }
  });
}