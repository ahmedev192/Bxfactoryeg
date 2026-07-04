"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ORDER_FIELDS = exports.ORDER_STATUS_LABELS = exports.SCENARIO_LABELS = exports.VendorType = exports.FieldType = exports.StepType = exports.ScenarioType = exports.OrderStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "ADMIN";
    UserRole["PLANNER"] = "PLANNER";
    UserRole["PRODUCTION_MANAGER"] = "PRODUCTION_MANAGER";
    UserRole["VIEWER"] = "VIEWER";
})(UserRole || (exports.UserRole = UserRole = {}));
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["DRAFT"] = "DRAFT";
    OrderStatus["PLANNED"] = "PLANNED";
    OrderStatus["RELEASED"] = "RELEASED";
    OrderStatus["IN_PRODUCTION"] = "IN_PRODUCTION";
    OrderStatus["COMPLETED"] = "COMPLETED";
    OrderStatus["ARCHIVED"] = "ARCHIVED";
})(OrderStatus || (exports.OrderStatus = OrderStatus = {}));
var ScenarioType;
(function (ScenarioType) {
    ScenarioType["FASTEST_TIME"] = "FASTEST_TIME";
    ScenarioType["LOWEST_COST"] = "LOWEST_COST";
    ScenarioType["BALANCED"] = "BALANCED";
    ScenarioType["MOST_RELIABLE"] = "MOST_RELIABLE";
    ScenarioType["CUSTOM"] = "CUSTOM";
})(ScenarioType || (exports.ScenarioType = ScenarioType = {}));
var StepType;
(function (StepType) {
    StepType["FABRIC"] = "FABRIC";
    StepType["PRINT"] = "PRINT";
    StepType["FACTORY"] = "FACTORY";
    StepType["GENERIC"] = "GENERIC";
})(StepType || (exports.StepType = StepType = {}));
var FieldType;
(function (FieldType) {
    FieldType["TEXT"] = "TEXT";
    FieldType["DATE"] = "DATE";
    FieldType["NUMBER"] = "NUMBER";
    FieldType["TEXTAREA"] = "TEXTAREA";
    FieldType["DROPDOWN"] = "DROPDOWN";
})(FieldType || (exports.FieldType = FieldType = {}));
var VendorType;
(function (VendorType) {
    VendorType["FACTORY"] = "FACTORY";
    VendorType["PRINTING_PLACE"] = "PRINTING_PLACE";
    VendorType["FABRIC_SUPPLIER"] = "FABRIC_SUPPLIER";
    VendorType["PROCESS_RESOURCE"] = "PROCESS_RESOURCE";
})(VendorType || (exports.VendorType = VendorType = {}));
exports.SCENARIO_LABELS = {
    [ScenarioType.FASTEST_TIME]: 'أسرع وقت',
    [ScenarioType.LOWEST_COST]: 'أقل تكلفة',
    [ScenarioType.BALANCED]: 'متوازن',
    [ScenarioType.MOST_RELIABLE]: 'الأكثر موثوقية',
    [ScenarioType.CUSTOM]: 'مخصص',
};
exports.ORDER_STATUS_LABELS = {
    [OrderStatus.DRAFT]: 'مسودة',
    [OrderStatus.PLANNED]: 'مخطط',
    [OrderStatus.RELEASED]: 'صادر',
    [OrderStatus.IN_PRODUCTION]: 'قيد الإنتاج',
    [OrderStatus.COMPLETED]: 'مكتمل',
    [OrderStatus.ARCHIVED]: 'مؤرشف',
};
exports.DEFAULT_ORDER_FIELDS = [
    { label: 'رقم أمر الإنتاج', value: '', fieldType: FieldType.TEXT, sortOrder: 0 },
    { label: 'التاريخ', value: new Date().toISOString().split('T')[0], fieldType: FieldType.DATE, sortOrder: 1 },
    { label: 'اسم المصنع', value: '', fieldType: FieldType.TEXT, sortOrder: 2 },
    { label: 'نوع الموديل', value: '', fieldType: FieldType.TEXT, sortOrder: 3 },
    { label: 'خامة القماش', value: '', fieldType: FieldType.TEXT, sortOrder: 4 },
    { label: 'تعليمات', value: '', fieldType: FieldType.TEXTAREA, sortOrder: 5 },
];
