import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { MultipartFile } from '@fastify/multipart';
import { sanitize } from 'sanitize-filename-ts';
import * as path from 'path';
import {
  htmlToJson,
  jsonToText,
  tiptapExtensions,
} from '../../../collaboration/collaboration.util';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { generateSlugId, sanitizeFileName } from '../../../common/helpers';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import { markdownToHtml } from '@docmost/editor-ext';
import {
  FileTaskStatus,
  FileTaskType,
  getFileTaskFolderPath,
} from '../utils/file.utils';
import { v7 as uuid7 } from 'uuid';
import { StorageService } from '../../storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../queue/constants';
import * as mammoth from 'mammoth';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly pageRepo: PageRepo,
    private readonly storageService: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.FILE_TASK_QUEUE)
    private readonly fileTaskQueue: Queue,
  ) {}

  async importPage(
    filePromise: Promise<MultipartFile>,
    userId: string,
    spaceId: string,
    workspaceId: string,
    targetParentId?: string,
  ): Promise<void> {
    const file = await filePromise;
    const fileBuffer = await file.toBuffer();
    const fileExtension = path.extname(file.filename).toLowerCase();
    const fileName = sanitize(
      path.basename(file.filename, fileExtension).slice(0, 255),
    );

    let prosemirrorState = null;
    let createdPage = null;

    try {
      if (fileExtension.endsWith('.md')) {
        const fileContent = fileBuffer.toString();
        prosemirrorState = await this.processMarkdown(fileContent);
      } else if (fileExtension.endsWith('.html')) {
        const fileContent = fileBuffer.toString();
        prosemirrorState = await this.processHTML(fileContent);
      } else if (fileExtension.endsWith('.docx')) {
        // Word文件处理 - 只支持.docx格式（Office Open XML）
        prosemirrorState = await this.processWord(
          fileBuffer,
          userId,
          spaceId,
          workspaceId,
        );
      }
    } catch (err) {
      const message = 'Error processing file content';
      this.logger.error(message, err);
      throw new BadRequestException(message);
    }

    if (!prosemirrorState) {
      const message = 'Failed to create ProseMirror state';
      this.logger.error(message);
      throw new BadRequestException(message);
    }

    const { title, prosemirrorJson } =
      this.extractTitleAndRemoveHeading(prosemirrorState);

    const pageTitle = title || fileName;

    if (prosemirrorJson) {
      try {
        const pagePosition = await this.getNewPagePosition(
          spaceId,
          targetParentId || null,
        );

        createdPage = await this.pageRepo.insertPage({
          slugId: generateSlugId(),
          title: pageTitle,
          content: prosemirrorJson,
          textContent: jsonToText(prosemirrorJson),
          ydoc: await this.createYdoc(prosemirrorJson),
          position: pagePosition,
          parentPageId: targetParentId || null,
          spaceId: spaceId,
          creatorId: userId,
          workspaceId: workspaceId,
          lastUpdatedById: userId,
        });

        this.logger.debug(
          `Successfully imported "${title}${fileExtension}. ID: ${createdPage.id} - SlugId: ${createdPage.slugId}"`,
        );

        // 如果是Word文件，更新附件的pageId关联
        if (fileExtension.endsWith('.docx')) {
          await this.updateWordAttachmentsPageId(
            createdPage.id,
            spaceId,
            workspaceId,
          );
        }
      } catch (err) {
        const message = 'Failed to create imported page';
        this.logger.error(message, err);
        throw new BadRequestException(message);
      }
    }

    return createdPage;
  }

  async processMarkdown(markdownInput: string): Promise<any> {
    try {
      const html = await markdownToHtml(markdownInput);
      return this.processHTML(html);
    } catch (err) {
      throw err;
    }
  }

  async processHTML(htmlInput: string): Promise<any> {
    try {
      return await htmlToJson(htmlInput);
    } catch (err) {
      throw err;
    }
  }

  async processWord(
    fileBuffer: Buffer,
    userId: string,
    spaceId: string,
    workspaceId: string,
  ): Promise<any> {
    try {
      this.logger.debug(`Converting Word document to HTML using mammoth, buffer size: ${fileBuffer.length} bytes`);

      // 检查文件是否为有效的.docx格式（ZIP格式，以PK开头）
      if (fileBuffer.length < 4 || fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4B) {
        this.logger.error('Invalid .docx file format. File does not start with PK signature.');
        throw new BadRequestException(
          'Invalid Word document format. Please ensure you are uploading a .docx file (not .doc). Old .doc format is not supported.'
        );
      }

      // 使用mammoth将Word转换为HTML
      const result = await mammoth.convertToHtml(
        { buffer: fileBuffer },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            try {
              this.logger.debug('Processing Word image...');
              
              // 读取图片数据
              const imageBuffer = await image.read();
              this.logger.debug(`Image buffer size: ${imageBuffer.length} bytes`);
              
              // 确定图片扩展名
              const contentType = image.contentType || 'image/png';
              const extension = contentType.split('/')[1] || 'png';
              
              // 生成唯一文件名
              const attachmentId = uuid7();
              const fileName = `image-${attachmentId}.${extension}`;
              
              // 上传到存储系统
              const filePath = `${workspaceId}/attachments/${attachmentId}/${fileName}`;
              await this.storageService.upload(
                filePath,
                imageBuffer,
              );
              
              this.logger.debug(`Successfully uploaded Word image: ${fileName}, path: ${filePath}`);
              
              // 插入附件记录到数据库
              await this.db
                .insertInto('attachments')
                .values({
                  id: attachmentId,
                  fileName: fileName,
                  filePath: filePath,
                  fileSize: imageBuffer.length,
                  fileExt: extension,
                  mimeType: contentType,
                  type: 'image',
                  pageId: null, // 稍后会关联
                  spaceId: spaceId,
                  workspaceId: workspaceId,
                  creatorId: userId,
                })
                .execute();
              
              this.logger.debug(`Successfully created attachment record for: ${fileName}`);
              
              // 返回新的图片URL - 使用正确的路由格式
              const imageUrl = `/api/files/${attachmentId}/${fileName}`;
              this.logger.debug(`Returning image URL: ${imageUrl}`);
              return {
                src: imageUrl,
              };
            } catch (err) {
              this.logger.error('Failed to process Word image', err);
              const errorMessage = err instanceof Error ? err.message : String(err);
              const errorStack = err instanceof Error ? err.stack : '';
              this.logger.error(`Error details: ${errorMessage}, stack: ${errorStack}`);
              // 如果图片处理失败，返回空src避免整个转换失败
              return { src: '' };
            }
          }),
          // 自定义样式映射以确保更好的转换
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Heading 4'] => h4:fresh",
            "p[style-name='Heading 5'] => h5:fresh",
            "p[style-name='Heading 6'] => h6:fresh",
            "p[style-name='List Paragraph'] => p:fresh",
            "p[style-name='Quote'] => blockquote:fresh",
            "r[style-name='Code'] => code",
          ],
        },
      );

      const htmlContent = result.value;
      
      // 记录转换警告（如果有）
      if (result.messages && result.messages.length > 0) {
        this.logger.warn(
          `Word conversion warnings: ${JSON.stringify(result.messages)}`,
        );
      }

      // 记录HTML内容以调试图片
      this.logger.debug(`HTML content length: ${htmlContent.length}`);
      const imgCount = (htmlContent.match(/<img/g) || []).length;
      this.logger.debug(`Number of <img> tags in HTML: ${imgCount}`);
      if (imgCount > 0) {
        // 记录前500字符的HTML内容以查看图片标签
        this.logger.debug(`HTML preview (first 500 chars): ${htmlContent.substring(0, 500)}`);
      }

      this.logger.debug('Word document converted to HTML successfully');

      // 使用现有的HTML处理流程
      return await this.processHTML(htmlContent);
    } catch (err) {
      this.logger.error('Failed to process Word document', err);
      throw new BadRequestException('Invalid Word document or conversion failed');
    }
  }

  /**
   * 更新Word导入时创建的附件的pageId关联
   */
  private async updateWordAttachmentsPageId(
    pageId: string,
    spaceId: string,
    workspaceId: string,
  ): Promise<void> {
    try {
      // 更新最近创建的、尚未关联页面的附件
      // 通过spaceId和workspaceId以及pageId为null来筛选
      await this.db
        .updateTable('attachments')
        .set({ pageId: pageId })
        .where('spaceId', '=', spaceId)
        .where('workspaceId', '=', workspaceId)
        .where('pageId', 'is', null)
        .execute();
        
      this.logger.debug(`Updated attachment pageId references for page ${pageId}`);
    } catch (err) {
      this.logger.error('Failed to update attachment pageId', err);
      // 不抛出异常，因为页面已经创建成功
    }
  }

  async createYdoc(prosemirrorJson: any): Promise<Buffer | null> {
    if (prosemirrorJson) {
      // this.logger.debug(`Converting prosemirror json state to ydoc`);

      const ydoc = TiptapTransformer.toYdoc(
        prosemirrorJson,
        'default',
        tiptapExtensions,
      );

      Y.encodeStateAsUpdate(ydoc);

      return Buffer.from(Y.encodeStateAsUpdate(ydoc));
    }
    return null;
  }

  extractTitleAndRemoveHeading(prosemirrorState: any) {
    let title: string | null = null;

    const content = prosemirrorState.content ?? [];

    if (
      content.length > 0 &&
      content[0].type === 'heading' &&
      content[0].attrs?.level === 1
    ) {
      title = content[0].content?.[0]?.text ?? null;
      content.shift();
    }

    // ensure at least one paragraph
    if (content.length === 0) {
      content.push({
        type: 'paragraph',
        content: [],
      });
    }

    return {
      title,
      prosemirrorJson: {
        ...prosemirrorState,
        content,
      },
    };
  }

  async getNewPagePosition(
    spaceId: string,
    parentPageId: string | null = null,
  ): Promise<string> {
    const lastPage = await this.db
      .selectFrom('pages')
      .select(['id', 'position'])
      .where('spaceId', '=', spaceId)
      .where('parentPageId', parentPageId ? '=' : 'is', parentPageId)
      .orderBy('position', (ob) => ob.collate('C').desc())
      .limit(1)
      .executeTakeFirst();

    if (lastPage) {
      return generateJitteredKeyBetween(lastPage.position, null);
    } else {
      return generateJitteredKeyBetween(null, null);
    }
  }

  async importZip(
    filePromise: Promise<MultipartFile>,
    source: string,
    userId: string,
    spaceId: string,
    workspaceId: string,
    targetParentId?: string,
  ) {
    const file = await filePromise;
    const fileBuffer = await file.toBuffer();
    const fileExtension = path.extname(file.filename).toLowerCase();
    const fileName = sanitizeFileName(
      path.basename(file.filename, fileExtension),
    );
    const fileSize = fileBuffer.length;

    const fileNameWithExt = fileName + fileExtension;

    const fileTaskId = uuid7();
    const filePath = `${getFileTaskFolderPath(FileTaskType.Import, workspaceId)}/${fileTaskId}/${fileNameWithExt}`;

    // upload file
    await this.storageService.upload(filePath, fileBuffer);

    const fileTask = await this.db
      .insertInto('fileTasks')
      .values({
        id: fileTaskId,
        type: FileTaskType.Import,
        source: source,
        status: FileTaskStatus.Processing,
        fileName: fileNameWithExt,
        filePath: filePath,
        fileSize: fileSize,
        fileExt: 'zip',
        creatorId: userId,
        spaceId: spaceId,
        workspaceId: workspaceId,
        parentPageId: targetParentId || null,
      })
      .returningAll()
      .executeTakeFirst();

    await this.fileTaskQueue.add(QueueJob.IMPORT_TASK, {
      fileTaskId: fileTaskId,
    });

    return fileTask;
  }
}
