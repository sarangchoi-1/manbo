import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';

export const config = {
  api: {
    bodyParser: false, // disables Next.js's default body parser
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const form = formidable({ multiples: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: 'Error parsing form data' });
      return;
    }

    const attachment = files['attachment-1']?.[0];
    if (attachment) {
      const fileContent = await fs.readFile(attachment.filepath, 'utf-8');
      if ( // if the attachment is a csv file
        attachment.mimetype === 'text/csv' ||
        attachment.originalFilename?.endsWith('.csv')
      ) {
        const records = parse(fileContent, { columns: true });
        console.log('CSV records:', records);
        res.status(200).json({ message: 'CSV parsed!', records });
      } else {
        res.status(200).json({ message: 'File read!', content: fileContent });
      }
    } else {
      res.status(400).json({ error: 'No attachment found' });
    }
  });
}