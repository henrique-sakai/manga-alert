//const dotenv = require('dotenv').config();
const axios = require('axios');
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REG });
const s3 = new AWS.S3();
const bucketParams = {
  Bucket: process.env.S3_BUCKET,
  Key: process.env.S3_KEY
};

module.exports.handler = async () => {
  let mangaList = await getS3MangaList();
  mangaList = JSON.parse(mangaList);

  const newChapters = await getNewChapters(mangaList);

  if (Object.keys(newChapters).length !== 0) {
    await updateS3MangaList(mangaList, newChapters);
    const content = createEmailContent(newChapters);
    await sendSNS(content);
  }
  
  return newChapters;
}

const getS3MangaList = async () => {
  const file = await s3.getObject(bucketParams).promise();
  return file.Body.toString();
};

const updateS3MangaList = async (mangas, newChapters) => {
  for (const title in newChapters) {
    mangas[title] = newChapters[title];
  }

  await s3.putObject({
      ...bucketParams,
      Body: JSON.stringify(mangas),
    })
    .promise();
};

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
    content = `${content}${newChapters[title].lastChapterUrl}   `;
  }

  return content;
}

const sendSNS = async (content) => {
    const params = {
        Message: content,
        TopicArn: process.env.SNS_MANGA
    };

    const sns = new AWS.SNS({ apiVersion: '2010-03-31' });

    sns.publish(params, function (err) {
        if (err) {
            console.log(err.message);
        } else {
            console.log("Email sent!");
        }
    });
}

this.handler()