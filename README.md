# manga-alert

####Crawler to check if there is a new manga chapter of my interest.
It works with AWS Lambda, S3 and SNS.
- S3 contains a file with the data of the last chapters I read;
- Lambda executes the crawler;
- SNS sends email notification.