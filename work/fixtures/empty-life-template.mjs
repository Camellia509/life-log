import ExcelJS from 'exceljs';

const recordSheets={
  '睡眠记录':['日期','安排','睡觉时间','起床时间','睡眠评分(1-5)','不熬夜','备注'],
  '学习记录':['日期','课程/项目','任务类型','计划分钟','实际分钟','完成','专注度(1-5)','备注'],
  '餐饮记录':['日期','早餐','午餐','午饭时长','晚餐','晚饭时长','水果/蔬菜','食堂≥1餐','饮水','夜宵','备注'],
  '习惯打卡':['日期','项目','类别','完成','分钟','备注'],
};

export async function createEmptyLifeTemplate(){
  const workbook=new ExcelJS.Workbook();
  workbook.creator='life-log synthetic CI fixture';
  for(const [name,headers] of Object.entries(recordSheets)){
    const sheet=workbook.addWorksheet(name);
    sheet.addRow(headers);
  }
  for(const name of ['健身记录','清洁记录','每日SOP'])workbook.addWorksheet(name);
  return workbook.xlsx.writeBuffer();
}
